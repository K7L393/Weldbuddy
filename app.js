const parseBold = (str) => {
    if (!str) return '';
    return str.replace(/\*\*(.*?)\*\//g, '<strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

// ========================================================
// APPLICATION CONFIGURATION
// ========================================================
// Replace this with your secure live backend URL (from Railway or your Cloudflare Tunnel)
const BACKEND_URL = "https://auhvy-109-146-29-187.run.pinggy-free.link/api/coach";

// GLOBAL APP STATES
let isPanelOpen = false;
let isMathPanelOpen = false; 
let isTutorialVisible = false; 
let activeProcess = "gmaw"; 
let runHistory = []; 

// ========================================================
// THE MODULAR PROCESS ENGINE REGISTRY
// ========================================================
const WeldingProcessRegistry = {
    gmaw: {
        calculate: function(s) {
            const wireDiameter = s.wire ? parseFloat(s.wire) : 1.0;
            let thicknessValue = 6;
            if (s.thickness === "8mm") thicknessValue = 8;
            if (s.thickness === "10mm") thicknessValue = 10;
            if (s.thickness === "12mm") thicknessValue = 12;
            if (s.thickness === "15mm") thicknessValue = 15;
            if (s.thickness === "20mm") thicknessValue = 20;
            if (s.thickness === "25mm+") thicknessValue = 28;

            let targetAmperage = thicknessValue * 22; 
            
            const isOutOfPosition = s.position === "3G" || s.position === "4G" || s.position === "6G";
            if (s.position === "3G") targetAmperage *= 0.75; 
            if (s.position === "4G") targetAmperage *= 0.80; 
            if (s.position === "6G") targetAmperage *= 0.72; 

            let minAmp = 130;
            let maxAmp = 330;
            
            if (s.wire && s.wire.includes("ER70S-6")) {
                if (isOutOfPosition) {
                    minAmp = wireDiameter === 1.0 ? 85 : 105;
                    maxAmp = wireDiameter === 1.0 ? 125 : 145;
                } else {
                    minAmp = wireDiameter === 1.0 ? 150 : 180;
                    maxAmp = wireDiameter === 1.0 ? 220 : 280;
                }
            } else if (s.wire && s.wire.includes("E71T-1M")) {
                minAmp = wireDiameter === 1.2 ? 130 : 160;
                maxAmp = isOutOfPosition ? (wireDiameter === 1.2 ? 190 : 210) : (wireDiameter === 1.2 ? 270 : 320);
            } else if (s.wire && s.wire.includes("E71T-8")) {
                minAmp = wireDiameter === 1.6 ? 140 : 170;
                maxAmp = isOutOfPosition ? 210 : 290;
            }

            targetAmperage = Math.min(Math.max(targetAmperage, minAmp), maxAmp);
            
            let jointModifier = 1.0;
            if (s.joint && (s.joint.includes("Root") || s.joint.includes("Butt"))) {
                jointModifier = 0.94; 
            }

            let computedVoltage = (14 + (0.05 * targetAmperage)) * jointModifier;
            
            if (s.wire && s.wire.includes("E71T-1M")) {
                if (isOutOfPosition) {
                    computedVoltage = (14 + (0.045 * targetAmperage) + 1.5); 
                } else {
                    computedVoltage += 3.5;
                }
            } else if (s.wire && s.wire.includes("E71T-8")) {
                computedVoltage -= 1.0; 
            } else if (s.wire && s.wire.includes("ER70S-6")) {
                if (isOutOfPosition) {
                    computedVoltage = (14 + (0.035 * targetAmperage) + 0.6); 
                } else {
                    computedVoltage += 1.0; 
                }
            }

            let area = Math.PI * Math.pow((wireDiameter / 2), 2);
            let computedWFS = Math.min(Math.max((targetAmperage * 0.038) / area, 3.0), 13.5);
            let gasSetup = s.wire && s.wire.includes("E71T-1M") ? "18-22 L/min (80/20 Ar/CO₂ Mix)" : s.wire && s.wire.includes("E71T-8") ? "None (Gasless Core)" : "14-18 L/min (92/8 Argon Mix)";

            return {
                amperage: Math.round(targetAmperage),
                voltage: computedVoltage.toFixed(1),
                wfs: computedWFS.toFixed(1),
                gas: gasSetup,
                vBar: Math.min(Math.max(((computedVoltage - 14) / 21) * 100, 10), 100) + "%",
                wfsBar: Math.min(Math.max(((computedWFS - 3.5) / 11.5) * 100, 10), 100) + "%",
                wireDiameter: wireDiameter
            };
        },
        renderMathReport: function(s, specs) {
            let baseThicknessVal = parseInt(s.thickness) || 6;
            if (s.thickness === "25mm+") baseThicknessVal = 28;

            let positionCoeff = 1.0;
            if (s.position === "3G") positionCoeff = 0.75;
            if (s.position === "4G") positionCoeff = 0.80;
            if (s.position === "6G") positionCoeff = 0.72;

            return `
                <div class="space-y-6">
                    <div class="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
                        <h3 class="text-xl font-bold text-theme mb-2">1. Target Amps (Heat Control)</h3>
                        <p class="text-zinc-400 mb-4">The calculator sets your baseline amps based on how thick your metal is. Thicker steel needs more juice to fuse properly. It automatically drops the amps if you are welding vertically or overhead so the puddle doesn't run out of the joint.</p>
                        <div class="bg-zinc-950 p-4 rounded-lg font-mono text-sm space-y-2 border border-zinc-900">
                            <div>• Metal Thickness: <span class="text-zinc-100">${baseThicknessVal}mm</span></div>
                            <div>• Position Multiplier: <span class="text-zinc-100">${positionCoeff}x (${s.position})</span></div>
                            <div class="border-t border-zinc-800 my-2 pt-2 text-theme font-bold">Formula: Base Amps = (Thickness × 22) × Position Modifier</div>
                            <div class="text-emerald-400 font-bold">Target Amps: ${specs.amperage} A</div>
                        </div>
                    </div>

                    <div class="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
                        <h3 class="text-xl font-bold text-theme mb-2">2. Wire Size Limits (Feeder Safety Limits)</h3>
                        <p class="text-zinc-400 mb-4">Instead of guessing like a regular AI, the app looks at the physical limits of your wire size first. For example, a 1.0mm solid wire can only handle so many amps before it burns back into your contact tip or bird-nests the feeder. The code locks in safe limits based on physics.</p>
                        <div class="bg-zinc-950 p-4 rounded-lg font-mono text-sm space-y-2 border border-zinc-900">
                            <div>• Wire Type Selected: <span class="text-zinc-100">${s.wire || '1.0mm ER70S-6'}</span></div>
                            <div>• Wire Surface Area: <span class="text-zinc-100">${(Math.PI * Math.pow((specs.wireDiameter / 2), 2)).toFixed(4)} mm²</span></div>
                            <div class="border-t border-zinc-800 my-2 pt-2 text-theme font-bold">Safe Current Ranges:</div>
                            <div>• Allowed Amps: <span class="text-zinc-100">${s.position === "3G" || s.position === "4G" || s.position === "6G" ? '85A - 200A (Fast Freeze Range)' : '150A - 320A (Flat Spray Range)'}</span></div>
                        </div>
                    </div>

                    <div class="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
                        <h3 class="text-xl font-bold text-theme mb-2">3. Calculating Voltage (Arc Length)</h3>
                        <p class="text-zinc-400 mb-4">Your base voltage is calculated straight from your target amps. If you choose an open root or groove joint, it drops the voltage slightly so you don't blow a hole through your root face, then fine-tunes it for your specific wire type.</p>
                        <div class="bg-zinc-950 p-4 rounded-lg font-mono text-sm space-y-2 border border-zinc-900">
                            <div>• Voltage Calculation: <span class="text-zinc-100">14 + (0.05 × Amps)</span></div>
                            <div>• Joint Type Modifier: <span class="text-zinc-100">${s.joint.includes('Root') || s.joint.includes('Butt') ? '0.94x (Open Root Protection)' : '1.0x (Standard Fillet Baseline)'}</span></div>
                            <div class="border-t border-zinc-800 my-2 pt-2 text-theme font-bold">Formula: Final Voltage = [14 + (0.05 × Amps)] × Joint Modifier + Wire Offset</div>
                            <div class="text-theme font-bold">Calculated Dial Setting: ${specs.voltage} V</div>
                        </div>
                    </div>

                    <div class="bg-zinc-900 p-6 rounded-xl border border-zinc-800">
                        <h3 class="text-xl font-bold text-theme mb-2">4. Wire Feed Speed (Feeder Speed Dial)</h3>
                        <p class="text-zinc-400 mb-4">The app converts your target amps into actual meters per minute on your feeder dial. This ensures the wire feeds into the puddle fast enough to give you a smooth, steady arc without stuttering or popping.</p>
                        <div class="bg-zinc-950 p-4 rounded-lg font-mono text-sm space-y-2 border border-zinc-900">
                            <div class="text-theme font-bold mb-1">Formula: Wire Speed = (Amps × 0.038) ÷ Wire Area</div>
                            <div class="text-emerald-400 font-bold">Feeder Setting: ${specs.wfs} m/min</div>
                        </div>
                    </div>
                </div>
            `;
        }
    }
};

// LOCAL STORAGE PERSISTENCE ENGINE BOOTSTRAP INIT
document.addEventListener("DOMContentLoaded", () => {
    const savedLogs = localStorage.getItem("weldBuddyHistory");
    if (savedLogs) {
        try {
            runHistory = JSON.parse(savedLogs);
            updateHistoryUI();
        } catch(e) {
            console.error("Failed parsing localStorage stack:", e);
            runHistory = [];
        }
    }
});

function toggleThemeDropdown() {
    document.getElementById('theme-dropdown').classList.toggle('hidden');
}

function setTheme(theme) {
    document.body.className = "bg-zinc-950 text-zinc-100 min-h-screen flex flex-col justify-center items-center overflow-hidden font-sans p-4 select-none";
    if (theme !== 'blue') document.body.classList.add('theme-' + theme);
    toggleThemeDropdown();
}

function toggleNoviceGuide() {
    const drawer = document.getElementById('novice-guide-drawer');
    const toggleText = document.getElementById('novice-toggle-text');
    const arrow = document.getElementById('novice-arrow');
    
    if (drawer.classList.contains('hidden')) {
        drawer.classList.remove('hidden');
        toggleText.innerText = "Hide Tutorial";
        arrow.style.transform = 'rotate(180deg)';
        isTutorialVisible = true;
    } else {
        drawer.classList.add('hidden');
        toggleText.innerText = "Show Guide";
        arrow.style.transform = 'rotate(0deg)';
        isTutorialVisible = false;
    }
}

function runNoviceCalculator() {
    const distance = parseFloat(document.getElementById('calc-distance').value) || 0;
    const seconds = parseFloat(document.getElementById('calc-seconds').value) || 0;
    const resultBox = document.getElementById('calc-speed-result');
    const targetInput = document.getElementById('hi-ts');

    if (!distance || !seconds) {
        resultBox.innerText = "0 mm/min";
        return;
    }

    const calculatedSpeed = Math.round((distance / seconds) * 60);
    resultBox.innerText = calculatedSpeed + " mm/min";
    targetInput.value = calculatedSpeed;
    calculateRealtimeHeatInput(false); 
}

function getSelectedValues() {
    return {
        thickness: document.getElementById('select-thickness').value,
        position: document.getElementById('select-position').value,
        wire: document.getElementById('select-wire').value,
        joint: document.getElementById('select-joint').value,
        machine: document.getElementById('select-machine').value,
        profile: document.getElementById('select-profile').value
    };
}

function updateDropdownOptions() {
    const position = document.getElementById('select-position').value;
    const jointSelect = document.getElementById('select-joint');
    const profileSelect = document.getElementById('select-profile');
    const jointLabel = document.getElementById('label-joint');
    const profileLabel = document.getElementById('label-profile');
    
    const prevJoint = jointSelect.value;
    const prevProfile = profileSelect.value;

    if (position === "6G") {
        if (jointLabel) jointLabel.innerText = "Joint Design";
        if (profileLabel) profileLabel.innerText = "Pipe Schedule / Wall";

        jointSelect.innerHTML = `
            <option value="Open Root V-Groove">Open Root V-Groove</option>
            <option value="V-Groove with Backing">V-Groove with Backing Ring</option>
        `;
        
        profileSelect.innerHTML = `
            <option value="Sch 40 Multi-Pass">Sch 40 / Standard Wall (Multi-Pass)</option>
            <option value="Sch 80 Multi-Pass">Sch 80 / Extra Heavy (Multi-Pass Matrix)</option>
        `;
    } else {
        if (jointLabel) jointLabel.innerText = "Joint Type";
        if (profileLabel) profileLabel.innerText = "Weld Size";

        if (!jointSelect.querySelector('option[value="T-Fillet"]')) {
            jointSelect.innerHTML = `
                <option value="T-Fillet">T-Fillet Joint</option>
                <option value="Butt Weld">Butt Weld (V-Groove)</option>
                <option value="Open Corner">Open Corner Joint</option>
                <option value="Lap Joint">Lap Joint</option>
            `;
            
            profileSelect.innerHTML = `
                <option value="6mm Single-Pass">6mm Single-Pass Fillet</option>
                <option value="8mm Single-Pass">8mm Single-Pass Fillet</option>
                <option value="8mm Multi-Pass">8mm Multi-Pass (Root + Cap)</option>
                <option value="10mm Multi-Pass">10mm Multi-Pass (3-Pass Run)</option>
                <option value="12mm Multi-Pass">12mm Multi-Pass (Multi-Layer Matrix)</option>
            `;
        }
    }
    
    if (jointSelect.querySelector(`option[value="${prevJoint}"]`)) jointSelect.value = prevJoint;
    if (profileSelect.querySelector(`option[value="${prevProfile}"]`)) profileSelect.value = prevProfile;
}

function injectParam() {
    updateDropdownOptions(); 
    if (isPanelOpen) renderInitialResponse();
}

function calculateRealtimeHeatInput(shouldLog = false) {
    const v = parseFloat(document.getElementById('hi-volt').value) || 0;
    const a = parseFloat(document.getElementById('hi-amp').value) || 0;
    const ts = parseFloat(document.getElementById('hi-ts').value) || 0;
    const out = document.getElementById('hi-result');

    if (!v || !a || !ts) {
        out.innerText = "0.00 kJ/mm";
        out.className = "text-3xl md:text-4xl font-mono font-black text-zinc-600 tracking-tight transition-all duration-300";
        return;
    }

    const heatInput = (v * a * 60) / (ts * 1000);
    const formattedResult = heatInput.toFixed(2);
    out.innerText = formattedResult + " kJ/mm";

    let evaluation = "Optimal Pass";
    if (heatInput > 2.5) {
        out.className = "text-3xl md:text-4xl font-mono font-black text-rose-500 animate-pulse tracking-tight transition-all duration-300";
        evaluation = "Too Hot";
    } else if (heatInput < 0.8) {
        out.className = "text-3xl md:text-4xl font-mono font-black text-amber-500 tracking-tight transition-all duration-300";
        evaluation = "Cold-Lap Risk";
    } else {
        out.className = "text-3xl md:text-4xl font-mono font-black text-emerald-400 tracking-tight transition-all duration-300";
    }

    if (shouldLog) {
        runHistory.unshift({
            time: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second:'2-digit'}),
            val: formattedResult,
            status: evaluation,
            speed: ts
        });
        if (runHistory.length > 3) runHistory.pop(); 
        localStorage.setItem("weldBuddyHistory", JSON.stringify(runHistory));
        updateHistoryUI();
    }
}

function deleteHistoryLog(index) {
    runHistory.splice(index, 1);
    localStorage.setItem("weldBuddyHistory", JSON.stringify(runHistory));
    updateHistoryUI();
}

function updateHistoryUI() {
    const container = document.getElementById('history-log-stack');
    if (!container) return;
    if (runHistory.length === 0) {
        container.innerHTML = `<span class="text-zinc-600 italic text-sm">No saved runs in memory stack. Click button above to stamp run.</span>`;
        return;
    }
    container.innerHTML = runHistory.map((h, i) => `
        <div class="flex justify-between items-center text-sm font-mono border-b border-zinc-900/50 pb-1.5 last:border-0 pt-1">
            <span class="text-zinc-500 font-bold">Run #${runHistory.length - i} [${h.time}]</span>
            <span class="text-zinc-400">${h.speed} mm/min &rarr;</span>
            <span class="${h.status.includes('Hot') ? 'text-rose-400' : h.status.includes('Cold') ? 'text-amber-400' : 'text-emerald-400'} font-black">${h.val} kJ/mm [${h.status}]</span>
            <button onclick="deleteHistoryLog(${i})" class="text-zinc-600 hover:text-rose-400 text-xs font-bold font-sans transition-colors shrink-0 ml-2">[Clear]</button>
        </div>
    `).join('');
}

function handleSubmit() {
    const panel = document.getElementById('results-panel');
    panel.style.transform = 'translateY(0)'; 
    panel.classList.remove('translate-y-full');
    panel.classList.add('translate-y-0');

    isPanelOpen = true;
    renderInitialResponse();
}

function minimizeResultsPanel() {
    const panel = document.getElementById('results-panel');
    panel.style.transform = ''; 
    panel.classList.remove('translate-y-0');
    panel.classList.add('translate-y-full');
    isPanelOpen = false;
}

function openMathDashboard() {
    const s = getSelectedValues();
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    
    const mathContainer = document.getElementById('math-content-area');
    mathContainer.innerHTML = currentEngine.renderMathReport(s, specs);

    const mathPanel = document.getElementById('math-panel');
    mathPanel.classList.remove('translate-y-full');
    mathPanel.classList.add('translate-y-0');
    isMathPanelOpen = true;
}

function minimizeMathPanel() {
    const mathPanel = document.getElementById('math-panel');
    mathPanel.classList.remove('translate-y-0');
    mathPanel.classList.add('translate-y-full');
    isMathPanelOpen = false;
}

function handleReset() {
    minimizeResultsPanel();
    minimizeMathPanel(); 
    runHistory = []; 
    localStorage.removeItem("weldBuddyHistory");
    document.getElementById('user-input').value = '';
    document.getElementById('select-thickness').value = '6mm';
    document.getElementById('select-position').value = '1G';
    updateDropdownOptions(); 
    document.getElementById('select-wire').value = '1.0mm ER70S-6';
    document.getElementById('select-joint').value = 'T-Fillet';
    document.getElementById('select-machine').value = 'Generic Standard CV Box';
    document.getElementById('select-profile').value = '6mm Single-Pass';
    
    document.getElementById('display-volt').innerText = "0.0 V";
    document.getElementById('bar-volt').style.width = "0%";
    document.getElementById('display-wfs').innerText = "0.0 m/min";
    document.getElementById('bar-wfs').style.width = "0%";
    document.getElementById('calc-distance').value = '';
    document.getElementById('calc-seconds').value = '';
    document.getElementById('calc-speed-result').innerText = "0 mm/min";
    document.getElementById('hi-ts').value = '';
    document.getElementById('hi-volt').value = '';
    document.getElementById('hi-amp').value = '';
    document.getElementById('hi-result').innerText = "0.00 kJ/mm";
    document.getElementById('hi-result').className = "text-3xl md:text-4xl font-mono font-black text-zinc-600 tracking-tight";
    document.getElementById('chat-thread').innerHTML = '';
    document.getElementById('shop-alert-banner').classList.add('hidden');
}

function renderInitialResponse() {
    const s = getSelectedValues();
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    const noteText = document.getElementById('user-input').value.trim();
    
    document.getElementById('target-requirements-display').innerText = `${s.thickness} // ${s.position} // ${s.wire}`;

    document.getElementById('display-volt').innerText = `${specs.voltage} V`;
    document.getElementById('bar-volt').style.width = specs.vBar;
    document.getElementById('display-wfs').innerText = `${specs.wfs} m/min`;
    document.getElementById('bar-wfs').style.width = specs.wfsBar;
    document.getElementById('display-gas').innerText = specs.gas;

    document.getElementById('hi-volt').value = parseFloat(specs.voltage) || 0;
    document.getElementById('hi-amp').value = parseInt(specs.amperage) || 0;

    const alertBanner = document.getElementById('shop-alert-banner');
    const alertTitle = document.getElementById('shop-alert-title');
    const alertText = document.getElementById('shop-alert-text');
    const isSinglePass = s.profile && s.profile.includes("Single-Pass");
    
    let thicknessValue = parseInt(s.thickness) || 6;
    if (s.thickness === "25mm+") thicknessValue = 28;

    if (thicknessValue >= 20 && specs.wireDiameter <= 1.0 && !isSinglePass) {
        alertBanner.className = "bg-blue-500/10 border border-blue-500/20 text-blue-300 p-4 rounded-xl text-base mb-4 animate-fadeIn";
        alertTitle.className = "font-bold block uppercase tracking-wide text-xs text-blue-400 mb-1";
        alertTitle.innerText = "💡 Production Efficiency Tip:";
        alertText.innerText = "While 1.0mm wire easily achieves full code compliance on heavy sections via multi-pass stacking, stepping up to 1.2mm solid or cored wires on your next high-volume heavy run will significantly increase deposition rates and cut down your arc time.";
        alertBanner.classList.remove('hidden');
    } else if (thicknessValue <= 6 && specs.wireDiameter >= 1.6) {
        alertBanner.className = "bg-rose-500/10 border border-rose-500/20 text-rose-300 p-4 rounded-xl text-base mb-4 animate-fadeIn";
        alertTitle.className = "font-bold block uppercase tracking-wide text-xs text-rose-400 mb-1";
        alertTitle.innerText = "⚠️ Shop Setup Alert:";
        alertText.innerText = "Large 1.6mm/2.0mm wire specs on light gauge material increase puddle burn-through risk. Step wire down for fine joint line management.";
        alertBanner.classList.remove('hidden');
    } else {
        alertBanner.classList.add('hidden');
    }

    const noteBanner = document.getElementById('note-banner-section');
    if (noteText) {
        document.getElementById('note-banner-text').innerText = `"${noteText}"`;
        noteBanner.classList.remove('hidden');
    } else {
        noteBanner.classList.add('hidden');
    }

    const mpSection = document.getElementById('multi-pass-section');
    if (s.profile && s.profile.includes("Multi-Pass")) {
        let parsedVolt = parseFloat(specs.voltage) || 0;
        let parsedWfs = parseFloat(specs.wfs) || 0;
        
        document.getElementById('mp-pass1').innerText = `${(parsedVolt - 1.5).toFixed(1)}V @ ${(parsedWfs - 1.0).toFixed(1)}m`;
        document.getElementById('mp-pass2').innerText = `${specs.voltage}V @ ${specs.wfs}m`;
        document.getElementById('mp-pass3').innerText = `${(parsedVolt - 0.5).toFixed(1)}V @ ${(parsedWfs - 0.4).toFixed(1)}m`;
        mpSection.classList.remove('hidden');
    } else {
        mpSection.classList.add('hidden');
    }

    const indSection = document.getElementById('inductance-section');
    let machineInductanceCoachNote = "";
    let supportsVariableInductance = ["ESAB Warrior", "ESAB Rebel", "ESAB Aristo", "Miller XMT", "Miller Invision", "Lincoln Power Wave", "Kemppi FastMig", "Kemppi X5"].includes(s.machine);

    if (supportsVariableInductance) {
        let targetKnobSetting = "50% (Standard Mid-Way Position)";
        let barWidth = "50%";
        let panelLabel = "Inductance Knob";
        
        if (s.machine === "ESAB Warrior" || s.machine === "ESAB Aristo") panelLabel = "Variable Arc Control Inductance Dial";
        if (s.machine === "Miller XMT" || s.machine === "Miller Invision") panelLabel = "Inductance / Dig Control Switch";
        if (s.machine === "Lincoln Power Wave") panelLabel = "Electronic Pinch Control Parameter";
        if (s.machine === "Kemppi FastMig" || s.machine === "Kemppi X5") panelLabel = "WiseArc Puddle Dynamics Regulator";
        
        if (s.position === "3G" || s.position === "4G" || s.position === "6G") {
            targetKnobSetting = "25% - 35% (Stiff Arc / Fast-Freezing Puddle)";
            barWidth = "30%";
            machineInductanceCoachNote = ` **Inductance Control Advice:** Since you are tracking a hard ${s.position} path using your ${s.machine}, drop your **${panelLabel}** down to 25%-35%. This closes your plasma profile and accelerates puddle freezing to hold your supportive root shelf without interior sagging or blowback.`;
        } else if (s.position === "1G" || s.position === "2G") {
            targetKnobSetting = "70% - 80% (Soft Arc / Smooth Fluid Puddle)";
            barWidth = "75%";
            machineInductanceCoachNote = ` **Inductance Control Advice:** For this horizontal layout using your ${s.machine}, twist your front panel **${panelLabel}** up to 70%-80%. This widens your arc flame, flattens the bead cross-section, and washes the edges flat into the side borders to cancel any chance of undercut.`;
        }

        document.getElementById('inductance-label').innerText = `Recommended ${panelLabel}`;
        document.getElementById('inductance-value').innerText = targetKnobSetting;
        document.getElementById('bar-inductance').style.width = barWidth;
        indSection.classList.remove('hidden');
    } else {
        indSection.classList.add('hidden');
        if (s.machine && s.machine !== "Generic Standard CV Box") {
            machineInductanceCoachNote = ` **Machine Profile Notice:** Your heavy duty ${s.machine} operates on factor-optimized internal inductance curves. Trust the unit's short-circuit dampening adjustments automatically and focus strictly on consistent gun travel speed rates.`;
        }
    }

    let rawBeadText = "Select parameters to generate stringer tracking guidelines.";
    let rawTorchText = "Select choices above to calculate code-compliant gun angle split data.";
    let rawStickText = "Select wire consumable options to calculate target extension distances.";

    if (s.wire) {
        if (s.wire.includes("ER70S-6")) {
            rawStickText = "Keep your Contact Tip to Work Distance (Stick-out) short at a tight **10mm to 12mm**. Keeping stick-out short prevents voltage drop across solid wire loops and ensures a clean, steady spray or short-circuit pool.";
            rawBeadText = `Solid wire requires keeping a highly concentrated arc spot directly ahead of your puddle boundary layer. Run crisp, sequential stringers. Avoid wider weave maneuvers to keep your gas shielding column unbroken and prevent oxide lines.${machineInductanceCoachNote}`;
        } else if (s.wire.includes("E71T-1M")) {
            rawStickText = "Maintain a Contact Tip to Work Distance (Stick-out) of **15mm to 20mm**. Cored slag wire requires this extended tracking length to let resistive pre-heating bake out filler core elements cleanly before entering the puddle matrix.";
            rawBeadText = `Gas-shielded cored wire produces a very fluid slag system. Run straight, uniform stringers or a compact, tight weave. Never sweep wide loop profiles, as liquid slag can easily roll around your puddle rim, causing sub-surface toe inclusions.${machineInductanceCoachNote}`;
        } else if (s.wire.includes("E71T-8")) {
            rawStickText = "Gasless wire requires an extended structural stick-out. Maintain an absolute distance of **19mm to 25mm**. This extended wire length is essential; it bakes out core moisture and activates shielding agents within the flux core before melting.";
            rawBeadText = `Gasless wire produces a fast-freezing, very heavy slag crust. Run uniform stringer tracks, ensuring you do not cross into previous cooling lines. Slag tracking control is vital; focus arc force precisely on the leading rim of the puddle.${machineInductanceCoachNote}`;
        }
    }

    if (s.joint) {
        if (s.joint === "T-Fillet") {
            rawTorchText = "Point the wire directly into the intersection corner using a square **45° split work angle**. Hold a **10° to 15° travel angle**—use a steady drag angle if using cored wire to roll slag backward, or a smooth push angle if running solid wire lines.";
        } else if (s.joint === "Butt Weld" || s.joint === "Open Root V-Groove" || s.joint === "V-Groove with Backing") {
            rawTorchText = "Align your primary torch approach angle directly flat at a square **90° center split angle** to avoid favoring either plate bevel shoulder wall. For root pass penetration sequences, track completely straight over the root face opening without sideways deviation.";
        } else {
            rawTorchText = "Maintain a steady split between your mating elements. Angle the torch path angle slightly toward the heavier thickness element to balance thermal soak distribution across the joint interfaces cleanly.";
        }
    }

    if (s.position) {
        if (s.position === "3G") {
            rawBeadText += " **Vertical Up Note:** You must establish a clear, supportive molten shelf pass-by-pass. Move quickly across the center face of the root valley, but **dwell momentarily at the joint boundaries** to deposit material directly into the undercut crater zone before reversing direction.";
        } else if (s.position === "4G") {
            rawBeadText += " **Overhead Note:** Gravity will draw an oversized pool down into a droop loop. Run exclusively fast, tight stringer bands. Do not attempt any lateral weaving methods; keep layers thin to accelerate freeze transitions.";
        } else if (s.position === "6G") {
            rawBeadText += " **6G Fixed Pipe Strategy:** You are tracking a fixed 45° pipe joint. This path requires a continuous, fluid transition as your body shifts quadrant-by-quadrant from the overhead bottom center up into the downhand top cap layer. Keep travel steady, avoid any lateral weaving oscillations on the root run, and let the arc natively lock the bevel faces together.";
        }
    }

    document.getElementById('coach-bead-text').innerHTML = parseBold(rawBeadText);
    document.getElementById('coach-angle-text').innerHTML = parseBold(rawTorchText);
    document.getElementById('coach-stickout-text').innerHTML = parseBold(rawStickText);

    const noticeZone = document.getElementById('preheat-notice-zone');
    if (s.thickness === "25mm+") {
        noticeZone.innerHTML = `<li class="text-amber-400 font-semibold">⚠️ AWS Code Preheat Required: Maintain a minimum soaked preheat footprint of 100°C. Monitor interpass thermal ceiling threshold to hold it below 230°C to preserve yield metrics.</li>`;
    } else {
        noticeZone.innerHTML = `<li>Preheat is optional under AWS specifications for standard structural carbon framing under 20mm, unless base structural plates are highly chilled.</li>`;
    }

    const drawer = document.getElementById('novice-guide-drawer');
    const toggleText = document.getElementById('novice-toggle-text');
    const arrow = document.getElementById('novice-arrow');
    if (isTutorialVisible) {
        drawer.classList.remove('hidden');
        toggleText.innerText = "Hide Tutorial";
        arrow.style.transform = 'rotate(180deg)';
    } else {
        drawer.classList.add('hidden');
        toggleText.innerText = "Show Guide";
        arrow.style.transform = 'rotate(0deg)';
    }

    updateHistoryUI();
}

function triggerQuickTroubleshoot(defect) {
    const s = getSelectedValues();
    const isOutOfPosition = s.position === "3G" || s.position === "4G" || s.position === "6G";
    const positionContext = s.position ? ` while tracking a ${isOutOfPosition ? 'out-of-position ' : ''}structural ${s.position} path` : "";
    const wireContext = s.wire ? ` running ${s.wire} wire` : "";
    const unitContext = s.machine ? ` powered by an industrial ${s.machine} station` : "";
    document.getElementById('follow-up-input').value = `How do I adjust machine settings or gun travel mechanics to eliminate structural ${defect}${positionContext}${wireContext}${unitContext}?`;
    sendFollowUp();
}

function switchTab(tab) {
    const specsBtn = document.getElementById('tab-specs-btn');
    const techBtn = document.getElementById('tab-tech-btn');
    const specsPanel = document.getElementById('panel-specs');
    const techPanel = document.getElementById('panel-tech');

    if (tab === 'specs') {
        specsBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all";
        techBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all";
        specsPanel.classList.remove('hidden');
        techPanel.classList.add('hidden');
    } else {
        techBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all";
        specsBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all";
        techPanel.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all"; 
        specsPanel.classList.add('hidden');
        techPanel.classList.remove('hidden');
    }
}

window.onclick = function(event) {
    if (!event.target.matches('#theme-btn')) {
        const dropdown = document.getElementById('theme-dropdown');
        if (dropdown && !dropdown.classList.contains('hidden')) dropdown.classList.add('hidden');
    }
}

function sendFollowUp() {
    const input = document.getElementById('follow-up-input');
    const questionText = input.value.trim();
    if (!questionText) return;
    
    const s = getSelectedValues(); 
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    const thread = document.getElementById('chat-thread');
    if (!thread) return;
    
    thread.innerHTML += `
        <div class="flex justify-end mt-4">
            <span class="bg-purple-950/10 text-purple-400 text-base px-4 py-2 rounded-xl border border-purple-500/20 max-w-md shadow-sm font-medium">
                ${questionText}
            </span>
        </div>
        <div id="loading-indicator" class="text-left text-zinc-500 text-sm italic mt-2 flex items-center gap-2">
            <span class="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping"></span>
            Weld Coach checking pool control specs...
        </div>
    `;
    
    input.value = '';
    const scrollContainer = document.getElementById('results-container');
    scrollContainer.scrollTop = scrollContainer.scrollHeight;

    const payload = {
        contents: [{
            parts: [{
                text: `You are WeldCoach, an elite industrial structural steel welding mentor. 
                The user is currently operating inside a welding booth running this exact configuration:
                - Material Thickness: ${s.thickness || '6mm Material'}
                - Welding Position: ${s.position || '1G Flat'}
                - Wire Type: ${s.wire || '1.0mm Solid Wire'}
                - Joint Type: ${s.joint || 'T-Fillet Joint'}
                - Machine Profile: ${s.machine || 'Standard Plant Set'}
                - Weld Size: ${s.profile || '6mm Single-Pass'}
                - CURRENT CALCULATED DIAL VOLTAGE: ${specs.voltage} V
                - CURRENT CALCULATED DIAL WIRE FEED SPEED: ${specs.wfs} m/min
                - ESTIMATED TARGET CURRENT CONSTANT: ${specs.amperage} Amps
                
                CRITICAL OUTPUT REQUIREMENTS:
                1. NEVER write walls of text, conversational filler, intros, or summaries. Do NOT say things like "Alright, let's dial this in" or "WeldCoach here".
                2. Get straight to the solution. Reference the user's current calculated dials directly if they ask for corrections or tuning.
                3. Break your response down strictly into explicit, short bullet points using clear line breaks.
                4. Group your fix strictly into two sections: "**1. Machine Dial Tuning**" and "**2. Torch & Technique Changes**".
                5. Keep each bullet point capped at a maximum of two crisp sentences.
                6. Bold specific target variables cleanly (e.g., **drop voltage by 0.5V - 1.0V**, **increase inductance**, **maintain a 45° work angle**).
                7. ENFORCE DEPOSITION EFFICIENCY POLICY: If the thickness is heavy (**20mm or thicker**), the wire is thin (**1.0mm solid wire or smaller**), and it is NOT a single-pass weld, you MUST explicitly back up the app's efficiency tip. Explain that while 1.0mm wire easily achieves full code compliance via multi-pass stacking, stepping up to a **1.2mm solid wire** or **dual-shield cored wire** will significantly increase deposition rates and cut down arc time on high-volume heavy production runs. Do NOT display this warning if they are running thin sections or single-pass welds.\n\nUser Question: ${questionText}`
            }]
        }]
    };

    fetch(BACKEND_URL, {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            // The Localtunnel bypass line has been completely removed from here!
        },
        body: JSON.stringify(payload)
    })
    .then(response => {
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        return response.json();
    })
    .then(data => {
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();

        let aiReply = data.candidates[0].content.parts[0].text;

        thread.innerHTML += `
            <div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mt-2 space-y-2">
                <div class="flex justify-between items-center border-b border-zinc-900/60 pb-1.5">
                    <span class="text-sm font-bold uppercase tracking-wider text-purple-400">WeldCoach Assistant</span>
                    <span class="text-xs bg-purple-950/40 border border-purple-500/30 text-purple-400 px-2 py-0.5 rounded font-mono uppercase tracking-tight">WeldCoach Tuning</span>
                </div>
                <div class="text-zinc-300 text-base text-left space-y-2 select-text font-sans leading-relaxed pt-1">
                    ${parseBold(aiReply).replace(/\n/g, '<br>')}
                </div>
            </div>
        `;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    })
    .catch(error => {
        const loader = document.getElementById('loading-indicator');
        if (loader) loader.remove();
        console.error("WeldForge API Connection Failed:", error);
        thread.innerHTML += `
            <div class="bg-rose-950/20 p-4 rounded-xl border border-rose-900/30 mt-2 text-rose-300 text-sm font-mono">
                🚨 Error reaching AI Engine. Server proxy down or API Key invalid.
            </div>
        `;
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
    });
}
