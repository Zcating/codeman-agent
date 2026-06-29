//! HomeRoute — Home route component (V2.2).
//!
 //! Renders the HomeAgentForm for creating new conversations.

import type { JSX } from "solid-js";
import { HomeAgentForm } from "../components/home";

export function HomeRoute(): JSX.Element {
  return <HomeAgentForm />;
}
