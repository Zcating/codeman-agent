import { Schema } from "effect";
import * as AST from "effect/SchemaAST";
import {
  Type,
  type TArray,
  type TBoolean,
  type TLiteral,
  type TNumber,
  type TObject,
  type TOptional,
  type TProperties,
  type TSchema,
  type TString,
} from "@sinclair/typebox";

type PrimitiveToTypeBox<V> = V extends string
  ? string extends V
  ? TString
  : V extends infer L
  ? L extends string | number | boolean
  ? TLiteral<L>
  : never
  : TString
  : V extends number
  ? number extends V
  ? TNumber
  : V extends infer L
  ? L extends number
  ? TLiteral<L>
  : never
  : TNumber
  : V extends boolean
  ? boolean extends V
  ? TBoolean
  : V extends infer L
  ? L extends boolean
  ? TLiteral<L>
  : never
  : TBoolean
  : V extends ReadonlyArray<string>
  ? TArray<TString>
  : never;

type RequiredKeys<T> = {
  [K in keyof T]-?: {} extends Pick<T, K> ? never : K;
}[keyof T];
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

type ShapeToTypeBox<T> = {
  -readonly [K in RequiredKeys<T>]: PrimitiveToTypeBox<T[K]>;
} & {
  -readonly [K in OptionalKeys<T>]: TOptional<PrimitiveToTypeBox<T[K]>>;
};

export type SchemaToTypeBox<S extends Schema.Struct<any>> = S extends Schema.Schema<
  infer A,
  infer _I,
  infer _R
>
  ? TObject<ShapeToTypeBox<A>>
  : never;

function stripUndefined(node: AST.Union): AST.AST {
  const nonUndef = node.types.filter((t) => t._tag !== "UndefinedKeyword");
  if (nonUndef.length === 1) {return nonUndef[0]!;}
  return AST.Union.make(nonUndef);
}

function walkAST(node: AST.AST): TSchema {
  switch (node._tag) {
    case "StringKeyword":
      return Type.String();
    case "NumberKeyword":
      return Type.Number();
    case "BooleanKeyword":
      return Type.Boolean();
    case "Literal": {
      const v = node.literal;
      if (typeof v === "bigint" || v === null) {
        throw new Error(
          `toToolParameters: AST Literal "${String(v)}" is not representable in ` +
          `TypeBox (Type.Literal accepts only string|number|boolean).`,
        );
      }
      return Type.Literal(v);
    }
    case "TupleType": {
      if (node.elements.length === 0 && node.rest.length === 1) {
        return Type.Array(walkAST(node.rest[0]!.type));
      }
      if (node.rest.length > 0) {
        throw new Error(
          `toToolParameters: TupleType with multiple \`rest\` elements is not supported.`,
        );
      }
      const items = node.elements.map((e) => walkAST(e.type)) as [
        TSchema,
        ...TSchema[],
      ];
      return Type.Tuple(items);
    }
    case "Union":
      return Type.Union(
        node.types.map(walkAST) as [TSchema, TSchema, ...TSchema[]],
      );
    case "Refinement":
      return walkAST(node.from);
    case "Transformation":
      return walkAST(node.to);
    case "TypeLiteral": {
      const properties: TProperties = {};
      for (const prop of node.propertySignatures) {
        const innerType =
          prop.isOptional && prop.type._tag === "Union"
            ? stripUndefined(prop.type as AST.Union)
            : prop.type;
        const valueSchema = walkAST(innerType);
        properties[String(prop.name)] = prop.isOptional
          ? Type.Optional(valueSchema)
          : valueSchema;
      }
      return Type.Object(properties);
    }
    default:
      throw new Error(
        `toToolParameters: unsupported AST node "${node._tag}". See D8-B for the supported node list, or extend the walker.`
      );
  }
}


export function toToolParameters<S extends Schema.Struct<any>>(
  schema: S,
): SchemaToTypeBox<S> {
  return walkAST(schema.ast) as SchemaToTypeBox<S>;
}