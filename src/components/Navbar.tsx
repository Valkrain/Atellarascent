import React from 'react';
import { Rocket, Wrench, Globe, Navigation, Play, Cpu } from 'lucide-react';

interface NavbarProps {
  activeTab: 'mission_control' | 'assembly' | 'flight' | 'map' | 'planner';
  setActiveTab: (tab: 'mission_control' | 'assembly' | 'flight' | 'map' | 'planner') => void;
  onQuickLaunch: () => void;
  hasActiveFlight: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ activeTab, setActiveTab, onQuickLaunch, hasActiveFlight }) => {
  return (
    <header className="flex flex-col md:flex-row items-center justify-between gap-4 px-6 py-3.5 bg-[#0B0E17] border-b border-slate-800 text-slate-100 select-none z-50">
      {/* Zone 1: Single text element wordmark */}
      <div className="flex items-center justify-between w-full md:w-auto">
        <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => setActiveTab('mission_control')}>
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Rocket className="w-5 h-5" />
          </div>
          <div>
            <span className="text-base font-bold tracking-tight text-white whitespace-nowrap block leading-none">
              Stellar Ascent
            </span>
            <span className="text-[10px] text-slate-400 font-mono tracking-wider">ORBITAL SIMULATOR</span>
          </div>
        </div>
      </div>

      {/* Zone 2: Distinct Top Scene Selection Menu */}
      <nav className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto py-1 px-1 bg-slate-950/80 border border-slate-800/80 rounded-xl">
        <button
          onClick={() => setActiveTab('mission_control')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'mission_control'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" /> Mission Control
        </button>
        <button
          onClick={() => setActiveTab('assembly')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'assembly'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" /> Assembly Hangar
        </button>
        <button
          onClick={() => setActiveTab('flight')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'flight'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Navigation className="w-3.5 h-3.5" /> Flight Simulator
        </button>
        <button
          onClick={() => setActiveTab('map')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'map'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Globe className="w-3.5 h-3.5" /> Orbital Map
        </button>
        <button
          onClick={() => setActiveTab('planner')}
          className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'planner'
              ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20 font-bold'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Play className="w-3.5 h-3.5" /> Flight Plan
        </button>
      </nav>

      {/* Zone 3: 1 primary action */}
      <div className="hidden md:flex items-center gap-3 shrink-0">
        <button
          onClick={onQuickLaunch}
          className="px-4 py-2.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-lg shadow-cyan-500/20 cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" /> {hasActiveFlight ? 'Resume Flight' : 'Quick Launch'}
        </button>
      </div>
    </header>
  );
};
