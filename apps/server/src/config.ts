import { SSMClient, GetParameterCommand, GetParametersByPathCommand, GetParametersByPathResult } from "@aws-sdk/client-ssm";

const client = new SSMClient();

export async function getParameter(name: string): Promise<string|undefined> {
    const response = await client.send(new GetParameterCommand({ Name: name, WithDecryption: true }));
    return response.Parameter?.Value;
}

export async function getConfig(basePath: string): Promise<Record<string, string>> {
    const config: Record<string, string> = {};
    let nextToken: string | undefined = undefined;

    do {
        const response:GetParametersByPathResult = await client.send(new GetParametersByPathCommand({
            Path: basePath,
            WithDecryption: true,
            NextToken: nextToken,
        }));

        response.Parameters?.forEach(param => {
            if (param.Name && param.Value) {
                const key = param.Name.replace(basePath, '').replace(/^\//, '');
                config[key] = param.Value;
            }
        });
        nextToken = response.NextToken;
    } while (nextToken);
    
    return config;
}