/* @refresh reload */
import { render } from "solid-js/web";
import { ChatView } from "./agent/components/ChatView";

const root = document.getElementById("root");
if (root) render(() => <ChatView />, root);