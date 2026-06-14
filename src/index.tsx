/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { RouterProvider } from "@tanstack/solid-router";
import { router } from "./router";

const root = document.getElementById("root");
if (root) render(() => <RouterProvider router={router} />, root);