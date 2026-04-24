import { DynamoDBClient, QueryCommand, AttributeValue, PutItemCommand, DeleteItemCommand, UpdateItemCommand, ReturnValue } from "@aws-sdk/client-dynamodb";
import { z } from "zod";
import { PuzzleInfo, PuzzleInfoUpdate, PuzzleState } from "./dbmodels";
import { formatISO } from "date-fns/formatISO";

const dbClient = new DynamoDBClient({region: process.env['AWS_REGION']});

function decodeContinuationToken(
    continuationToken?: string,
): Record<string, AttributeValue> | undefined {
    const stringRecord = z.record(z.string(), z.unknown());

    if (continuationToken) {
        const decoded = Buffer.from(continuationToken, 'base64').toString();
        return stringRecord.parse(JSON.parse(decoded)) as Record<string, AttributeValue>;
    } else {
        return undefined;
    }
}

function encodeContinuationToken(
    lastEvaluatedKey: Record<string, unknown> | undefined,
): string | undefined {
    if (lastEvaluatedKey) {
        const serialized = JSON.stringify(lastEvaluatedKey);
        return Buffer.from(serialized, 'binary').toString('base64');
    } else {
        return undefined;
    }
}

/**
 * Converts the dynamodb data to a PuzzleInfo record or throws a validation error
 * @param data 
 * @returns 
 */
function unmarshalPuzzleInfo(data: Record<string, AttributeValue>): PuzzleInfo {
    return PuzzleInfo.parse({
        id: data['id']?.S,
        name: data['name']?.S,
        author: data['author']?.S,
        model: data['model']?.S,
        state: data['state']?.S,
        lastModified: data['lastModified']?.S,
        upvotes: data['upvotes']?.N ? parseInt(data['upvotes'].N) : undefined,
        downvotes: data['downvotes']?.N ? parseInt(data['downvotes'].N) : undefined,
    })
}

function marshalPuzzleInfo(info: PuzzleInfo): Record<string, AttributeValue> {
    const rec:Record<string, AttributeValue> = {
        id: {S: info.id},
        name: {S: info.name},
        author: {S: info.author},
        model: {S: info.model},
        state: {S: info.state},
        lastModified: {S: info.lastModified},
    }
    if(info.upvotes) {
        rec['upvotes'] = {N: info.upvotes.toString()}
    }
    if(info.downvotes) {
        rec['downvotes'] = {N: info.downvotes.toString()}
    }
    return rec;
}

export async function listPuzzles(TableName: string, state: PuzzleState, Limit: number, cursor?: string): Promise<{results: PuzzleInfo[], continuationToken?: string}> {
    const ExclusiveStartKey = decodeContinuationToken(cursor);

    const response = await dbClient.send(new QueryCommand({
        TableName,
        IndexName: "idxStatusDate",
        KeyConditionExpression: '#s = :stateParam',
        ExpressionAttributeNames: {
            '#s': "state"
        },
        ExpressionAttributeValues: {
            ':state': {S: state},
        },
        Limit,
        ExclusiveStartKey,
        ScanIndexForward: false,
    }));

    const continuationToken = encodeContinuationToken(response.LastEvaluatedKey);
    const results = response.Items?.map(unmarshalPuzzleInfo) ?? [];
    return {results, continuationToken};
}

export async function updatePuzzleInfo(TableName: string, id: string, update:PuzzleInfoUpdate) {
    const updateParts = [
        update.author ? "author = :ath" : undefined,
        update.name ? "name = :n" : undefined,
        update.state ? "state = :st" : undefined,
    ];
    const attribs = [
        update.author ? {":ath": {S: update.author}} : undefined,
        update.name ? {":n": {S: update.name}} : undefined,
        update.state ? {":st": {S: update.state}} : undefined
    ];

    if(updateParts.length==0) return;

    const UpdateExpression = updateParts.filter(p=>!!p).join(", ");
    const ExpressionAttributeValues = attribs.reduce((acc, attr)=>{
        if(attr) {
            return {...acc, ...attr}
        } else {
            return acc;
        }
    }, {});

    const response = await dbClient.send(new UpdateItemCommand({
        TableName,
        Key: {
            "id": {S: id},
        },
        UpdateExpression,
        ExpressionAttributeValues,
        ReturnValues: ReturnValue.ALL_NEW,
    }));

    return response.Attributes ? unmarshalPuzzleInfo(response.Attributes) : undefined;
}

export async function updatePuzzleLastMod(TableName: string, id: string, newTime?: Date) {
    const timeToUpdate = newTime ?? Date.now();
    
    await dbClient.send(new UpdateItemCommand({
        TableName,
        Key: {
            "id": {S: id},
        },
        UpdateExpression: "SET lastModified = :lmt",
        ExpressionAttributeValues: {
            ":lmt": {S: formatISO(timeToUpdate)}
        }
    }));
}

export async function updatePuzzleState(TableName: string, id: string, newState: PuzzleState) {
    await dbClient.send(new UpdateItemCommand({
        TableName,
        Key: {
            "id": {S: id},
        },
        UpdateExpression: "SET state = :st",
        ExpressionAttributeValues: {
            ":st": {S: newState}
        }
    }));
}

export async function writePuzzleInfo(TableName: string, info: PuzzleInfo) {
    await dbClient.send(new PutItemCommand({
        TableName,
        Item: marshalPuzzleInfo(info)
    }))
}

export async function deletePuzzleInfo(TableName: string, puzzleId: string) {
    await dbClient.send(new DeleteItemCommand({
        TableName,
        Key: {
            'id': {S: puzzleId}
        }
    }));
}