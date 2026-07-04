import { Outlet } from 'react-router-dom';
import { NavBar } from './NavBar';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col relative w-full overflow-hidden bg-background">
      <NavBar />
      <main className="flex-1 flex flex-col relative z-10 w-full">
        <Outlet />
      </main>
    </div>
  );
}
