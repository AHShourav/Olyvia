import { createBrowserRouter, Navigate, useNavigate } from "react-router-dom";
import { Login } from "../features/auth/Login";
import { Signup } from "../features/auth/Signup";
import { Home } from "../features/menu/Home";
import { Dashboard } from "../features/menu/Dashboard";
import { Settings } from "../features/profile/Settings";
import { Scan } from "../features/input/Scan";
import FoodDetail from "../features/food/fooddetail";
import { OnboardingWrapper } from "../features/onboarding/OnboardingWrapper";
import ProtectedLayout from "./ProtectedLayout";

function LoginRoute() {
  const navigate = useNavigate();
  return (
    <Login
      onLoginSuccess={() => navigate("/onboarding")}
      onSwitchToSignup={() => navigate("/auth/signup")}
    />
  );
}

function SignupRoute() {
  const navigate = useNavigate();
  return (
    <Signup
      onSignupSuccess={() => navigate("/onboarding")}
      onSwitchToLogin={() => navigate("/auth/login")}
    />
  );
}

function OnboardingRoute() {
  const navigate = useNavigate();
  return <OnboardingWrapper onComplete={() => navigate("/app/home")} />;
}

function HomeRoute() {
  const navigate = useNavigate();
  return <Home onStartScan={() => navigate("/app/scan")} />;
}

function SettingsRoute() {
  const navigate = useNavigate();
  return (
    <Settings
      onLogout={() => {
        localStorage.removeItem("user");
        localStorage.removeItem("onboarding.completed");
        navigate("/auth/login");
      }}
      onResetOnboarding={() => {
        localStorage.removeItem("onboarding.completed");
        navigate("/onboarding");
      }}
    />
  );
}

export const router = createBrowserRouter([
  {
    path: "/auth/login",
    element: <LoginRoute />,
  },
  {
    path: "/auth/signup",
    element: <SignupRoute />,
  },
  {
    path: "/onboarding",
    element: <OnboardingRoute />,
  },
  {
    path: "/app",
    element: <ProtectedLayout />,
    children: [
      { index: true, element: <Navigate to="home" replace /> },
      { path: "home", element: <HomeRoute /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "settings", element: <SettingsRoute /> },
      { path: "scan", element: <Scan /> },
      { path: "food/:foodId", element: <FoodDetail /> },
    ],
  },
  {
    path: "*",
    element: <Navigate to="/auth/login" replace />,
  },
]);