/* @refresh reload */
import "./index.css";
import { render } from "solid-js/web";
import { ChatView } from "./agent/components/chat-view";

const root = document.getElementById("root");
if (root) render(() => <ChatView />, root);