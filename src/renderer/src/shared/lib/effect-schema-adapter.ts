


















































import { Either, ParseResult, Schema, SchemaAST, Option } from "effect";
type ParseIssue = ParseResult.ParseIssue;




export interface StandardSchemaV1Issue {
  readonly message: string;
  readonly path?:
    | ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
    | undefined;
}

export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaV1Issue> };

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly "~standard": {
    readonly version: 1;
    readonly vendor: "effect";
    readonly validate: (
      value: unknown,
    ) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output };
  };
}


export function effectSchema<A, I, R>(
  schema: Schema.Schema<A, I, R>,
): StandardSchemaV1<I, A> {
  return {
    "~standard": {
      version: 1,
      vendor: "effect",
      validate: (value: unknown): StandardSchemaV1Result<A> => {
        
        const result: Either.Either<A, ParseIssue> = ParseResult.validateEither(
          schema,
          { errors: "all" },
        )(value);
        if (Either.isRight(result)) {
          return { value: result.right };
        }
        return { issues: flattenIssue(result.left, []) };
      },
      types: { input: undefined as unknown as I, output: undefined as unknown as A },
    },
  };
}


export function firstErrorMessage(errors: ReadonlyArray<unknown>): string | undefined {
  const first = errors[0];
  if (typeof first === "string") {return first;}
  if (first && typeof first === "object" && "message" in first) {
    const m = (first as StandardSchemaV1Issue).message;
    if (typeof m === "string") {return m;}
  }
  return undefined;
}




const evalAnnotation = (
  annotation: unknown,
  issue: ParseIssue,
): string | undefined => {
  if (typeof annotation === "string") {return annotation;}
  if (typeof annotation !== "function") {return undefined;}
  const result = annotation(issue);
  if (typeof result === "string") {return result;}
  if (typeof result === "object" && result !== null && "message" in result) {
    const m = (result as { message: unknown }).message;
    if (typeof m === "string") {return m;}
  }
  return undefined;
};

const fallbackMessage = (issue: ParseIssue): string =>
  `Invalid value (${issue._tag})`;


function resolveMessage(issue: ParseIssue): string {
  
  const ast: SchemaAST.AST | undefined = (() => {
    switch (issue._tag) {
      case "Type":
      case "Missing":
      case "Forbidden":
        return issue.ast as SchemaAST.AST;
      default:
        return undefined;
    }
  })();
  if (ast !== undefined) {
    const annotation = Option.getOrUndefined(SchemaAST.getMessageAnnotation(ast));
    if (annotation !== undefined) {
      const evaluated = evalAnnotation(annotation, issue);
      if (evaluated !== undefined) {return evaluated;}
    }
  }
  
  const direct = (issue as { message?: unknown }).message;
  if (typeof direct === "string") {
    return direct;
  }
  
  return fallbackMessage(issue);
}


function flattenIssue(
  issue: ParseIssue,
  prefix: ReadonlyArray<PropertyKey>,
): StandardSchemaV1Issue[] {
  if (issue._tag === "Composite") {
    
    const issues = issue.issues;
    const children: ReadonlyArray<ParseIssue> = Array.isArray(issues)
      ? (issues as ReadonlyArray<ParseIssue>)
      : [issues as ParseIssue];
    return children.flatMap((child) => flattenIssue(child, prefix));
  }
  if (issue._tag === "Pointer") {
    const segs = Array.isArray(issue.path) ? issue.path : [issue.path];
    return flattenIssue(issue.issue, [...prefix, ...segs]);
  }
  if (issue._tag === "Refinement") {
    return flattenIssue(issue.issue, prefix);
  }
  if (issue._tag === "Transformation") {
    
    return flattenIssue(issue.issue, prefix);
  }
  
  return [
    {
      message: resolveMessage(issue),
      path: prefix.length > 0 ? prefix : undefined,
    },
  ];
}