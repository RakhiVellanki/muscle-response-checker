import { Routes, Route, Navigate } from "react-router-dom";
import NavBar from "./components/NavBar";
import FlexBeeper from "./pages/FlexBeeper";
export default function App() {
  return (
    <div className="min-h-screen w-full min-w-390 bg-gray-950 text-white">
      <NavBar />
      <div className="w-full p-4">
        <Routes>
          <Route path="/" element={<Navigate to="/flex-beeper" replace />} />
          <Route path="/flex-beeper" element={<FlexBeeper />} />
          <Route path="*" element={<div className="p-6">Not found</div>} />
        </Routes>
      </div>
    </div>
  );
}
