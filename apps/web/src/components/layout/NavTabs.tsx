import { NavLink } from 'react-router';

const tabs = [
  { to: '/dashboard',      label: 'Dashboard',      icon: '◈' },
  { to: '/players',        label: 'Players',         icon: '⌬' },
  { to: '/settings',       label: 'Server Settings', icon: '⚙' },
  { to: '/console',        label: 'Console',         icon: '>' },
  { to: '/access-control', label: 'Access Control',  icon: '⊘' },
  { to: '/wipe',           label: 'Wipe Manager',    icon: '⊠' },
  { to: '/schedules',      label: 'Schedules',       icon: '◷' },
  { to: '/servers',        label: 'Servers',         icon: '⊞' },
];

export default function NavTabs() {
  return (
    <div className="nav-tabs">
      {tabs.map(tab => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) => `nav-tab${isActive ? ' active' : ''}`}
        >
          <span>{tab.icon}</span>
          {tab.label}
        </NavLink>
      ))}
    </div>
  );
}
