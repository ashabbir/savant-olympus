import React from 'react';
import { Cpu, Shield, Activity, Zap } from 'lucide-react';

interface StartupScreenProps {
  progress: string;
  subtext?: string;
}

const StartupScreen: React.FC<StartupScreenProps> = ({ progress, subtext }) => {
  return (
    <div className="fixed inset-0 bg-[#080b12] flex items-center justify-center z-[1000] overflow-hidden">
      {/* background effects */}
      <div className="absolute inset-0 opacity-20 pointer-events-none">
         <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[var(--cp-cyan)] rounded-full blur-[120px] animate-pulse" />
         <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[var(--cp-magenta)] rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="relative flex flex-col items-center max-w-md w-full px-8">
        <div className="mb-12 flex flex-col items-center">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-[var(--cp-cyan)] blur-2xl opacity-20 animate-pulse" />
            <div className="relative border-2 border-[var(--cp-cyan)] p-6 bg-[#080b12]">
               <Shield size={48} className="text-[var(--cp-cyan)]" />
               <Activity size={24} className="absolute -bottom-2 -right-2 text-[var(--cp-magenta)] bg-[#080b12]" />
            </div>
          </div>
          <h1 
            style={{ fontFamily: "'Orbitron', sans-serif", letterSpacing: '0.3em' }}
            className="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[var(--cp-cyan)] to-[var(--cp-magenta)]"
          >
            SAVANT_OLYMPUS
          </h1>
          <div 
            style={{ fontFamily: "'Share Tech Mono', monospace" }}
            className="text-[10px] text-[var(--cp-cyan)] opacity-40 mt-2 tracking-[0.2em]"
          >
            SYSTEM_BOOT_v{APP_VERSION}
          </div>
        </div>
        
        <div className="w-full space-y-4">
          <div className="h-1 w-full bg-[#0d1220] border border-[var(--cp-border)] relative overflow-hidden">
            <div className="absolute inset-y-0 left-0 bg-[var(--cp-cyan)] animate-[loading_2s_infinite_ease-in-out]" style={{ width: '30%' }} />
          </div>
          
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2">
              <Zap size={10} className="text-[var(--cp-yellow)] animate-pulse" />
              <span 
                style={{ fontFamily: "'Share Tech Mono', monospace" }}
                className="text-[10px] text-[var(--cp-cyan)] tracking-widest uppercase"
              >
                {progress}
              </span>
            </div>
            {subtext && (
               <div 
                 style={{ fontFamily: "'Rajdhani', sans-serif" }}
                 className="text-[10px] text-[var(--foreground)] opacity-40 italic"
               >
                 {subtext}
               </div>
            )}
          </div>
        </div>

        <div 
          style={{ fontFamily: "'Share Tech Mono', monospace" }}
          className="mt-16 w-full space-y-1 opacity-20 text-[9px]"
        >
          <div className="flex gap-2">
             <span className="text-[var(--cp-cyan)]">{'>'}</span>
             <span>INITIALIZING_SECURE_KERNEL...</span>
          </div>
          <div className="flex gap-2">
             <span className="text-[var(--cp-cyan)]">{'>'}</span>
             <span>ESTABLISHING_NEURAL_LINK...</span>
          </div>
          <div className="flex gap-2">
             <span className="text-[var(--cp-cyan)]">{'>'}</span>
             <span>AUTHENTICATING_OLYMPUS_HEURISTICS...</span>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loading {
          0% { left: -30%; }
          100% { left: 100%; }
        }
      `}</style>
    </div>
  );
};

export default StartupScreen;
