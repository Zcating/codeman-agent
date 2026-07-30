











import { Schema } from "effect";


export const WorkspaceIdSchema = Schema.String.pipe(Schema.brand("WorkspaceId"));


export type WorkspaceId = Schema.Schema.Type<typeof WorkspaceIdSchema>;
