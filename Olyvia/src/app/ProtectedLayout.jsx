import { Navigate, Outlet } from "react-router-dom";

const isAuthenticated = () => {
  // The app stores `user` after login; keep this in sync with authentication flow.
  return localStorage.getItem("user");
};

export default function ProtectedLayout() {
  if (!isAuthenticated()) {
    return <Navigate to="/auth/login" />;
  }

  return <Outlet />;
}