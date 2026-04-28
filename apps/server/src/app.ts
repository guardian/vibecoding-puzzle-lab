import express, { Express, Request, Response } from 'express';
import { getConfig } from './config.js';
import { createPresignedDownloadUrl, createPresignedUploadUrl, objectExistsInS3 } from './s3.js';
import { callBedrock, userMessage, extractText, assistantMessage, extractJson } from './bedrock.js';
import { DebugRequest } from './models.js';
import { getPuzzleInfo, listPuzzles, updatePuzzleInfo, updatePuzzleState, writePuzzleInfo } from './dynamo.js';
import { CreatePuzzleRequest, PuzzleInfo, PuzzleInfoUpdate, PuzzleStates} from '@puzzle-lab/common-lib';
import { userIdentityFromHeaders } from './auth.js';


function stripInvalidUnicodeSurrogates(input: string): string {
  let out = '';

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Keep valid surrogate pairs and drop unmatched surrogate halves.
    if (code >= 0xD800 && code <= 0xDBFF) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xDC00 && next <= 0xDFFF) {
        out += input[i] + input[i + 1];
        i += 1;
      }
      continue;
    }

    if (code >= 0xDC00 && code <= 0xDFFF) {
      continue;
    }

    out += input[i];
  }

  return out;
}

function sanitizePromptText(promptText: string): string {
  const withoutInvalidSurrogates = stripInvalidUnicodeSurrogates(promptText);

  // Round-trip through UTF-8 to ensure we pass valid UTF-8 text downstream.
  const utf8Bytes = Buffer.from(withoutInvalidSurrogates, 'utf8');
  const utf8Text = new TextDecoder('utf-8', { fatal: true }).decode(utf8Bytes);

  // Remove all control/unprintable Unicode categories.
  return utf8Text.replace(/[\p{C}]/gu, '').trim();
}

export async function createApp(): Promise<Express> {
  const app = express();

  const stage = process.env.STAGE || 'DEV';
  const stack = process.env.STACK || 'playground';
  const appName = process.env.APP || 'puzzle-lab';

  const config = await getConfig(`/${stage}/${stack}/${appName}`);
  console.log("Loaded config:", config);
  
  // Middleware
  app.use(
    express.json({
      type: ['application/json', 'application/*+json', 'text/json'],
    })
  );

  // Middleware to set CSP
  // app.use((req, res, next) => {
  //   res.setHeader("Content-Security-Policy", "img-src 'self'; style-src 'self'; font-src 'self';");
  //   next();
  // });

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.post('/api/:bundleid/debug', async (req: Request, res: Response) => {
    const { bundleid } = req.params;
    const details = DebugRequest.safeParse(req.body);
    if (!details.success) {
      res.status(400).json({ error: 'Invalid request body', details: details.error });
      return;
    }

    const helperPrefix = "{\"jsx\":";
    const messages = [
      userMessage(`The code you provided is not working, please fix it. Here is the code: \`\`\`jsx\n${details.data.jsx}\`\`\` 
        The last error message was: "${details.data.lastError}". 
        Here are the container logs: \`\`\`${details.data.containerLogs ?? 'No container logs provided'}\`\`\``),
      assistantMessage(helperPrefix)
    ];

    for(let retry = 0; retry < 3; retry++) {
      const result = await callBedrock({
        messages,
        maxTokens: 60000,
        modelId: config['bedrock_model_id'],
      });

        try {
          const responseJson = extractJson(result.response, helperPrefix);
          res.json(responseJson);
          return;
        } catch(err) {
          console.warn("Failed to parse Bedrock response as JSON, adding more context and retrying:", err);
          messages.push(userMessage(`I couldn't parse this json: ${helperPrefix + extractText(result.response)}`));
          messages.push(assistantMessage(helperPrefix));
        }
    }
    res.status(500).json({ error: "The model could not produce understandable output" });
  });

  app.post('/api/:bundleId/prompt', async (req: Request, res: Response) => {
    const { bundleId } = req.params;

    try {
      const promptText = req.body?.promptText;
      if (typeof promptText !== 'string') {
        res.status(400).json({ error: 'promptText is required and must be a string' });
        return;
      }

      const sanitizedPromptText = sanitizePromptText(promptText);
      if (sanitizedPromptText.length === 0) {
        res.status(400).json({ error: 'promptText contains no valid characters after sanitization' });
        return;
      }

      const helperPrefix = "{\"jsx\":";
      let messages = [userMessage(sanitizedPromptText), assistantMessage(helperPrefix)];

      for(let retry = 0; retry < 3; retry++) {
        const result = await callBedrock({
          messages,
          maxTokens: 60000,
          modelId: config['bedrock_model_id'],
        });

        try {
          const responseJson = extractJson(result.response, helperPrefix) as {jsx: string, explanation?: string, title?: string};
          try {
            if(responseJson.title) {
              await updatePuzzleInfo(config["indexTable"], bundleId as string, {name: responseJson.title, state: 'visible'});
            }
          } catch(err) {
            console.warn(`Failed to update puzzle title after generation for bundle ${bundleId}:`, err);
          }
          res.status(200).json(responseJson);
          return;
        } catch(err) {
          console.warn("Failed to parse Bedrock response as JSON, adding more context and retrying:", err);
          messages.push(userMessage(`I couldn't parse this json: ${helperPrefix + extractText(result.response)}`));
          messages.push(assistantMessage(helperPrefix));
        }
      }
      res.status(500).json({ error: "The model could not produce understandable output" });

    } catch (err) {
      console.error(`Error calling Bedrock for bundle ${bundleId}:`, err);
      res.status(500).json({ error: 'Failed to generate response' });
    }

    try {
      await updatePuzzleState(config["indexTable"], bundleId as string, 'visible');
    } catch(err) {
      console.error(`Failed to update puzzle state to visible for bundle ${bundleId}:`, err);
    }
  });

  app.get('/api/whoami', (req: Request, res: Response) => {
    try {
      const info = userIdentityFromHeaders(req.headers);
      res.status(200).json(info);
    } catch(err) {
      console.error(`Could not get user identity from headers: ${err}`);
      res.status(500).json({ error: 'Failed to get user identity' });
    }
  });

  app.post('/api/bundle/new', async (req: Request<never, CreatePuzzleRequest>, res: Response) => {
    const parseResult = CreatePuzzleRequest.safeParse(req.body);
    if(!parseResult.success) {
      res.status(400).json({ error: 'Invalid request body', details: parseResult.error });
      return;
    }

    try {
      const userInfo = userIdentityFromHeaders(req.headers);

      const info:PuzzleInfo = {
        id: crypto.randomUUID(),
        name: parseResult.data.name ?? "Untitled Puzzle",
        author: userInfo.email,
        model: config.bedrock_model_id,
        state: 'draft',
        lastModified: new Date().toISOString(),
      };

      await writePuzzleInfo(config.indexTable, info);

      res.status(201).json({ id: info.id });
    } catch(err) {
      console.error("Error creating new puzzle bundle:", err);
      res.status(500).json({ error: 'Failed to create new puzzle bundle' });
    }
  });

  // Create a short-lived presigned URL for uploading a bundle directly to S3.
  app.post('/api/bundle/:bundleId', async (req: Request, res: Response) => {
    const { bundleId } = req.params;
    const bucket = config['s3_bucket'];
    if (!bucket) {
      res.status(500).json({ error: 'S3 bucket not configured' });
      return;
    }

    const expiresInSeconds = 300;
    const key = `bundles/${bundleId}.zip`;

    try {
      const uploadUrl = await createPresignedUploadUrl(bucket, key, expiresInSeconds);
      res.json({ uploadUrl, expiresInSeconds });
    } catch(err) {
      console.error(`Cannot create upload URL for bundle with ID ${bundleId}:`, err);
      res.status(500).json({ error: 'Failed to prepare bundle upload' });
    }
  });

  // Redirect to a short-lived presigned URL for downloading a bundle from S3.
  app.get('/api/bundle/:bundleId', async (req: Request, res: Response) => {
    const { bundleId } = req.params;
    const bucket = config['s3_bucket'];
    if (!bucket) {
      res.status(500).json({ error: 'S3 bucket not configured' });
      return;
    }

    const versionIdQuery = req.query.versionId;
    const versionId =
      typeof versionIdQuery === 'string'
        ? versionIdQuery
        : Array.isArray(versionIdQuery) && typeof versionIdQuery[0] === 'string'
          ? versionIdQuery[0]
          : undefined;

    const expiresInSeconds = 300;
    const key = `bundles/${bundleId}.zip`;

    try {
      const exists = await objectExistsInS3(bucket, key, versionId);
      if (!exists) {
        res.status(404).json({ error: 'Bundle not found' });
        return;
      }

      const downloadUrl = await createPresignedDownloadUrl(bucket, key, versionId, expiresInSeconds);
      res.redirect(307, downloadUrl);
    } catch (err: any) {
      console.error(`Cannot create download URL for bundle with ID ${bundleId} from S3:`, err);
      res.status(500).json({ error: 'Failed to retrieve bundle' });
    }
  });


  app.get('/api/index', async (req: Request, res: Response) => {
    const state = PuzzleStates.safeParse(req.query.state);
    if(state.error) {
      res.status(400).json({status: "error", detail: "invalid bundle state"});
      return;
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
    if(isNaN(limit)) {
      res.status(400).json({status: "error", detail: "limit must be a number"});
      return;
    }

    try {
      const {results, continuationToken} = await listPuzzles(config["indexTable"], state.data, limit, req.query.cursor as string|undefined);
      res.status(200).json({
        status: "ok",
        bundles: results,
        cursor: continuationToken
      });
    } catch(err) {
      console.error(String(err));
      res.status(500).json({
        status: "error",
        detail: "database error, see logs"
      });
    }
  });

  app.get('/api/bundle/:bundleId/metadata', async (req:Request<{bundleId: string}>, res: Response)=>{
    const {bundleId} = req.params;

    try {
      const response = await getPuzzleInfo(config["indexTable"], bundleId);
      if(response) {
        res.status(200).json(response)
      } else {
        res.status(404).json({
          status: "notfound"
        })
      }
    } catch(err) {
      console.error(String(err));
      res.status(500).json({
        status: "error",
        detail: "database error, see logs for more details"
      })
    }
  });

  app.put('/api/bundle/:bundleId/metadata', async (req:Request<{bundleId: string}, PuzzleInfoUpdate>, res: Response)=>{
    const {bundleId} = req.params;

    try {
      const updated = await updatePuzzleInfo(config["indexTable"], bundleId, req.body);
      if(updated) {
        res.status(200).json({
          status: "ok",
          updated,
        })
      } else {
        res.status(404).json({
          status: "notfound"
        })
      }
    } catch(err) {
      console.error(String(err));
      res.status(500).json({
        status: "error",
        detail: "database error, see logs for more details"
      })
    }
  });

  // Error handling middleware
  app.use((err: any, req: Request, res: Response, next: any) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
