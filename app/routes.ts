import { type RouteConfig, route, index } from "@react-router/dev/routes";

export default [
  route("login", "routes/login.tsx"),
  route("register", "routes/register.tsx"),
  route("dashboard", "routes/dashboard-layout.tsx", [
    index("routes/dashboard-home.tsx"),
    route("users", "routes/dashboard-users.tsx"),
    route("users/create", "routes/dashboard-users-create.tsx"),
    route("users/:userId/edit", "routes/dashboard-users-edit.tsx"),
    route("study-programs", "routes/dashboard-study-program.tsx"),
    route("study-programs/create", "routes/dashboard-study-program-create.tsx"),
    route("study-programs/:programId/edit", "routes/dashboard-study-program-edit.tsx"),
    route("led-projects", "routes/dashboard-led-project.tsx"),
    route("led-projects/create", "routes/dashboard-led-project-create.tsx"),
    route("led-projects/:projectId/edit", "routes/dashboard-led-project-edit.tsx"),
  ]),
] satisfies RouteConfig;
