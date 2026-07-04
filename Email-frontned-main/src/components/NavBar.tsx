import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function NavBar() {
  const location = useLocation();

  const links = [
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'How it Works', path: '/how-it-works' },
    { name: 'Dashboard', path: '/dashboard' },
  ];

  return (
    <nav className="relative z-10 flex flex-row justify-between items-center px-8 py-6 max-w-7xl mx-auto w-full">
      <Link to="/" className="text-3xl tracking-tight text-foreground" style={{ fontFamily: "'Instrument Serif', serif" }}>
        Velorah<sup className="text-xs">®</sup>
      </Link>
      <div className="hidden md:flex gap-8 items-center">
        {links.map((link) => {
          const isActive = location.pathname === link.path || (link.path !== '/' && location.pathname.startsWith(link.path));
          return (
            <Link
              key={link.name}
              to={link.path}
              className={cn(
                "text-sm transition-colors hover:text-foreground",
                isActive ? "text-foreground" : "text-muted-foreground"
              )}
            >
              {link.name}
            </Link>
          );
        })}
      </div>
      <button className="liquid-glass rounded-full px-6 py-2.5 text-sm text-foreground hover:scale-[1.03] transition-transform duration-300 cursor-pointer">
        Begin Journey
      </button>
    </nav>
  );
}
