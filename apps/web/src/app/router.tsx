import { createBrowserRouter } from "react-router";
import { LoginPage, RegisterPage } from "../pages/auth/index.tsx";
import { ChatPage } from "../pages/chat/index.tsx";
import { EntriesPage, EntryPage } from "../pages/entries/index.tsx";
import { DeleteAccountPage, MePage, TaxonomyPage } from "../pages/me/index.tsx";
import { NotFoundPage } from "../pages/not-found/index.tsx";
import { PanoramaPage } from "../pages/panorama/index.tsx";
import { PeoplePage } from "../pages/people/index.tsx";
import { PersonPage } from "../pages/person/index.tsx";
import { RelationshipPage } from "../pages/relationship/index.tsx";
import { AppShell } from "./AppShell.tsx";

/** URL → page. Everything except 注册 / 登录 sits inside the logged-in AppShell. */
export const router = createBrowserRouter([
  { path: "/login", element: <LoginPage /> },
  { path: "/register", element: <RegisterPage /> },
  {
    element: <AppShell />,
    children: [
      { index: true, element: <ChatPage /> },
      { path: "entries", element: <EntriesPage /> },
      { path: "entries/:entryId", element: <EntryPage /> },
      { path: "people", element: <PeoplePage /> },
      { path: "people/:personId", element: <PersonPage /> },
      { path: "people/:personId/relationships/:otherId", element: <RelationshipPage /> },
      { path: "graph", element: <PanoramaPage /> },
      { path: "me", element: <MePage /> },
      { path: "me/taxonomy", element: <TaxonomyPage /> },
      { path: "me/delete-account", element: <DeleteAccountPage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
]);
