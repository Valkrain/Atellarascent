import React, { useState } from 'react';
import { FlightPlanInstruction } from '../types';
import { Plus, Trash2, Play, ChevronUp, ChevronDown, Cpu } from 'lucide-react';

interface FlightPlannerProps {
  instructions: FlightPlanInstruction[];
  setInstructions: React.Dispatch<React.SetStateAction<FlightPlanInstruction[]>>;
}

export const FlightPlanner: React.FC<FlightPlannerProps> = ({ instructions, setInstructions }) => {
  const [newType, setNewType] = useState<FlightPlanInstruction['type']>('throttle');
  const [newTarget, setNewTarget] = useState<number>(100);
  const [panels, setPanels] = useState({
    builder: true,
    queue: true,
  });

  const handleAddInstruction = () => {
    const inst: FlightPlanInstruction = {
      id: 'inst_' + Math.random().toString(36).substr(2, 9),
      type: newType,
      targetValue: newTarget,
      enabled: true,
    };
    setInstructions([...instructions, inst]);
  };

  const handleToggle = (id: string) => {
    setInstructions(instructions.map((i) => (i.id === id ? { ...i, enabled: !i.enabled } : i)));
  };

  const handleDelete = (id: string) => {
    setInstructions(instructions.filter((i) => i.id !== id));
  };

  return (
    <div className="relative w-full h-[calc(100vh-73px)] bg-[#07090E] overflow-hidden select-none flex flex-col">
      {/* Floating Header Toolbar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
        <div className="pointer-events-auto bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 px-4 py-2.5 rounded-2xl flex items-center gap-3 shadow-xl">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Cpu className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-white uppercase tracking-wider">Flight Plan & Autopilot Queue</h1>
            <p className="text-[10px] text-slate-400 font-mono">Automated Sequencing & Ascent Profile</p>
          </div>
        </div>

        {/* Minimized Panel Pill Buttons */}
        <div className="flex items-center gap-2 pointer-events-auto">
          {!panels.builder && (
            <button
              onClick={() => setPanels((p) => ({ ...p, builder: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-cyan-400 shadow-lg hover:border-cyan-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Autopilot Builder</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
          {!panels.queue && (
            <button
              onClick={() => setPanels((p) => ({ ...p, queue: true }))}
              className="px-3 py-1.5 bg-[#0B0E17]/90 backdrop-blur border border-slate-800 rounded-xl text-xs font-mono text-amber-400 shadow-lg hover:border-amber-500/50 cursor-pointer flex items-center gap-1.5"
            >
              <span>Instruction Queue</span> <ChevronDown className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Content with Floating Glass Cards */}
      <div className="flex-1 overflow-y-auto p-6 pt-24 max-w-4xl mx-auto w-full space-y-6 z-10">
        {/* Instruction Builder Card */}
        {panels.builder && (
          <div className="p-6 bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 rounded-2xl shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Add Flight Instruction</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure automated commands for ascent and staging.</p>
              </div>
              <button
                onClick={() => setPanels((p) => ({ ...p, builder: false }))}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Minimize Panel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as FlightPlanInstruction['type'])}
                className="bg-slate-900 border border-slate-800 text-xs text-slate-300 rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan-500 w-full"
              >
                <option value="throttle">Set Throttle (%)</option>
                <option value="pitch">Set Pitch Angle (deg)</option>
                <option value="stage">Trigger Staging</option>
                <option value="wait_altitude">Wait for Altitude (km)</option>
              </select>

              <input
                type="number"
                value={newTarget}
                onChange={(e) => setNewTarget(parseFloat(e.target.value))}
                className="bg-slate-900 border border-slate-800 text-xs text-white rounded-xl px-4 py-2.5 focus:outline-none focus:border-cyan-500 w-full"
                placeholder="Target Value"
              />

              <button
                onClick={handleAddInstruction}
                className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <Plus className="w-4 h-4" /> Add Step
              </button>
            </div>
          </div>
        )}

        {/* Queue List Card */}
        {panels.queue && (
          <div className="p-6 bg-[#0B0E17]/90 backdrop-blur-md border border-slate-800/80 rounded-2xl shadow-2xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider">Flight Plan Queue</h2>
                <p className="text-[11px] text-slate-400 mt-0.5">Active automated sequence execution list.</p>
              </div>
              <button
                onClick={() => setPanels((p) => ({ ...p, queue: false }))}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
                title="Minimize Panel"
              >
                <ChevronUp className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {instructions.length === 0 ? (
                <div className="text-center py-12 border border-dashed border-slate-800 rounded-xl p-6">
                  <Play className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">No flight plan instructions configured.</p>
                </div>
              ) : (
                instructions.map((inst, index) => (
                  <div
                    key={inst.id}
                    className="flex items-center justify-between p-4 bg-slate-900/90 border border-slate-800 rounded-xl"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-slate-950 flex items-center justify-center border border-slate-800 text-xs font-mono font-bold text-cyan-400">
                        #{index + 1}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-white capitalize">{inst.type.replace('_', ' ')}</h4>
                        <span className="text-[10px] font-mono text-slate-400">Target: {inst.targetValue}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggle(inst.id)}
                        className={`px-3 py-1 text-[11px] font-semibold rounded-lg transition-all cursor-pointer ${
                          inst.enabled
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                            : 'bg-slate-950 text-slate-500 border border-slate-800'
                        }`}
                      >
                        {inst.enabled ? 'Enabled' : 'Disabled'}
                      </button>
                      <button
                        onClick={() => handleDelete(inst.id)}
                        className="p-1.5 text-rose-400 hover:bg-rose-500/10 rounded-lg transition-all cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
