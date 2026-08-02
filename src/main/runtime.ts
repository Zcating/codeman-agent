import { Layer, ManagedRuntime } from "effect";

// PR-3 会往 MainLive 挂 DbLive 等服务层
export const MainLive = Layer.empty;
export const mainRuntime = ManagedRuntime.make(MainLive);
