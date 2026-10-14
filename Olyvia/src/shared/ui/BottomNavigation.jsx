import { useNavigate, useLocation } from "react-router-dom";

export default function BottomNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="bottom-nav">
      <button
        className={location.pathname.includes("menu") ? "active" : ""}
        onClick={() => navigate("/app/menu")}
      >
        Menu
      </button>

      <button
        className={location.pathname.includes("stats") ? "active" : ""}
        onClick={() => navigate("/app/stats")}
      >
        Stats
      </button>

      <button
        className={location.pathname.includes("profile") ? "active" : ""}
        onClick={() => navigate("/app/profile")}
      >
        Profile
      </button>
    </div>
  );
}