import { NavLink } from "react-router-dom";

const base = "px-3 py-2 rounded-md text-sm font-medium";
const active = "bg-blue-600";
const idle = "text-gray-300 hover:bg-gray-800";

export default function NavBar() {
  return (
    <nav className="sticky top-0 z-10 bg-gray-900/90 backdrop-blur border-b border-gray-800">
      <div className="w-full px-4 py-3 flex items-center gap-3">
        <div className="text-lg font-bold">EMG Tools</div>
        <div className="flex gap-2">
          <NavLink to="/flex-beeper" className={({isActive}) => `${base} ${isActive ? active : idle}`}>
            Flex Beeper
          </NavLink>
        </div>
      </div>
    </nav>
  );
}
