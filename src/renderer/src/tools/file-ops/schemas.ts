import { Schema } from "effect";

export const FilePathSchema = Schema.String.pipe(
  Schema.filter(
    (s) => !s.split(/[\\/]+/).some((seg) => seg === ".."),
    { message: () => "Path component '..' is not allowed" },
  ),
  Schema.brand("FilePath"),
);

export type FilePath = Schema.Schema.Type<typeof FilePathSchema>;
