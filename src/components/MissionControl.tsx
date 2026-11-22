import React, { useState } from 'react';
import { CraftDesign } from '../types';
import { STELLAR_SYSTEM } from '../data/stellarSystem';
import { CRAFT_PRESETS } from '../data/presets';
import { Rocket, Wrench, Play, Sparkles, ArrowUpRight, ChevronUp, ChevronDown } from 'lucide-react';

interface MissionControlProps {
  currentCraft: CraftDesign;
  onLaunchPreset: (preset: CraftDesign) => void;
  setActiveTab: (tab: 'mission_control' | 'assembly' | 'flight' | 'map' | 'planner') => void;
}

export const MissionControl: React.FC<MissionControlProps> = ({ currentCraft, onLaunchPreset, setActiveTab }) => {
  const [panels, setPanels] = useState({
    hero: true,
    presets: true,
    stellar: true,
  });

  return (
    <div className="relative w-full h-[calc(100vh-73px)] bg-[#07090E] overflow-y-auto p-6 select-none">
      {/* Floating Header Toolbar */}
      <div className="sticky top-0 mb-6 flex items-center justify-between z-20 pointer-events-none">
        <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-xl">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-white uppercase tracking-wider">Mission Control Deck</h1>
            <p className="text-[10px] text-slate-400 font-mono">Aethel Star System Operations & Launch Prep</p>
          </div>
        </div>

        {/* Minimized Panel Pill Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {!panels.hero && (
            <button
              onClick={() => setPanels((p) => ({ ...p, hero: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-cyan-400 shadow-lg hover:border-cyan-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Operations Hero</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.presets && (
            <button
              onClick={() => setPanels((p) => ({ ...p, presets: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-amber-400 shadow-lg hover:border-amber-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Templates</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.stellar && (
            <button
              onClick={() => setPanels((p) => ({ ...p, stellar: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-emerald-400 shadow-lg hover:border-emerald-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Stellar Bodies</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full space-y-6 pb-12 z-10">
        {/* Hero Banner Panel */}
        {panels.hero && (
          <div className="relative p-8 rounded-3xl bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 shadow-2xl overflow-hidden flex flex-col md:flex-row items-center justify-between gap-8 animate-in fade-in duration-200">
            <div className="space-y-4 max-w-xl">
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5" /> Aethel Star System Operations
                </div>
                <button
                  onClick={() => setPanels((p) => ({ ...p, hero: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer md:hidden"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
                Stellar Ascent Flight Control
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                Design modular orbital rockets in the Assembly Hangar, simulate true atmospheric drag and delta-V physics, and execute maneuvers across Aurelia, Lunara, and Caelum.
              </p>
              <div className="flex items-center gap-4 pt-2">
                <button
                  onClick={() => setActiveTab('assembly')}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2 cursor-pointer"
                >
                  <Wrench className="w-4 h-4" /> Open Assembly Hangar
                </button>
                <button
                  onClick={() => setActiveTab('flight')}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition-all border border-slate-800 flex items-center gap-2 cursor-pointer"
                >
                  <Rocket className="w-4 h-4" /> Launch Telemetry
                </button>
              </div>
            </div>

            <div className="w-full md:w-80 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono text-slate-400">Current Hangar Vessel</span>
                <button
                  onClick={() => setPanels((p) => ({ ...p, hero: false }))}
                  className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer hidden md:block"
                  title="Minimize Panel"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
              </div>
              <div className="text-lg font-bold text-white">{currentCraft.name}</div>
              <div className="flex justify-between text-xs font-mono text-slate-400">
                <span>Total Mass: <strong className="text-white">{currentCraft.totalMass}t</strong></span>
                <span>Parts: <strong className="text-cyan-400">{currentCraft.parts.length}</strong></span>
              </div>
              <button
                onClick={() => setActiveTab('flight')}
                className="w-full mt-2 py-2.5 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 border border-cyan-500/30 font-semibold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" /> Launch Active Vessel
              </button>
            </div>
          </div>
        )}

        {/* Quick Start Presets Panel */}
        {panels.presets && (
          <div className="p-6 rounded-3xl bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Pre-Built Mission Templates</h2>
              <button
                onClick={() => setPanels((p) => ({ ...p, presets: false }))}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Minimize Panel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {CRAFT_PRESETS.map((preset) => (
                <div
                  key={preset.id}
                  className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between group shadow-lg"
                >
                  <div className="space-y-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                      <Rocket className="w-5 h-5" />
                    </div>
                    <h3 className="text-base font-bold text-white">{preset.name}</h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{preset.description}</p>
                  </div>
                  <div className="pt-6 flex items-center justify-between border-t border-slate-800/80 mt-6">
                    <span className="text-xs font-mono text-slate-400">{preset.totalMass}t · ${preset.totalCost}</span>
                    <button
                      onClick={() => onLaunchPreset(preset)}
                      className="px-4 py-2 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 border border-cyan-500/30 text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer"
                    >
                      Select & Launch <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stellar System Bodies Panel */}
        {panels.stellar && (
          <div className="p-6 rounded-3xl bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Aethel Star System Targets</h2>
              <button
                onClick={() => setPanels((p) => ({ ...p, stellar: false }))}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Minimize Panel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {STELLAR_SYSTEM.map((body) => (
                <div key={body.id} className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: body.colorHex }} />
                  <h4 className="text-xs font-bold text-white">{body.name}</h4>
                  <div className="text-[10px] font-mono text-slate-400 space-y-0.5">
                    <div>Radius: {body.radius} km</div>
                    <div>Orbit: {body.orbitRadius} km</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
