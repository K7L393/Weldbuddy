const parseBold = (str) => {
    if (!str) return '';
    return str.replace(/\*\*(.*?)\*\//g, '<strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

// GLOBAL APP STATES
let isPanelOpen = false;
let isMathPanelOpen = false; 
let isTutorialVisible = false; 
let activeProcess = "gmaw"; 
let runHistory = []; 

// LOCAL STORAGE PERSISTENCE ENGINE BOOTSTRAP INIT
document.addEventListener("DOMContentLoaded", () => {
    const savedLogs = localStorage.getItem("weldBuddyHistory");
    if (savedLogs) {
        try {
            runHistory = JSON.parse(savedLogs);
        } catch(e) {
            console.error("Failed parsing localStorage stack:", e);
        }
    }
    updateDropdownOptions(); 
});

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
                primaryVal: computedVoltage.toFixed(1) + " V", 
                secondaryVal: computedWFS.toFixed(1) + " m/min",
                wireDiameter: wireDiameter
            };
        },
        renderMathReport: function(s, specs) {
            return `<div class="p-4 bg-zinc-900 rounded-xl font-mono text-sm text-blue-400">GMAW Engine Output Active. Calculated Constant: ${specs.amperage} Amps</div>`;
        }
    },
    smaw: {
        calculate: function(s) {
            const rodDiameter = s.wire ? parseFloat(s.wire) : 3.2;
            let targetAmperage = rodDiameter * 40; 
            
            const isOutOfPosition = s.position === "3G" || s.position === "4G" || s.position === "6G";
            
            if (s.wire && s.wire.includes("E7018")) {
                if (isOutOfPosition) targetAmperage *= 0.88; 
            } else if (s.wire && s.wire.includes("E6010")) {
                if (s.joint && s.joint.includes("Root")) targetAmperage *= 0.90; 
            }

            let minAmp = 50;
            let maxAmp = 220;

            if (rodDiameter === 2.5) { minAmp = 55; maxAmp = 95; }
            else if (rodDiameter === 3.2) { minAmp = 90; maxAmp = 145; }
            else if (rodDiameter === 4.0) { minAmp = 135; maxAmp = 195; }

            targetAmperage = Math.min(Math.max(targetAmperage, minAmp), maxAmp);

            let referenceVoltage = 22;
            if (s.wire && s.wire.includes("E6010")) referenceVoltage = 26;
            if (s.wire && s.wire.includes("E6013")) referenceVoltage = 20;

            let digValue = 50; 
            if (s.wire && s.wire.includes("E6010")) digValue = 85; 
            if (s.wire && s.wire.includes("E7018") && isOutOfPosition) digValue = 65; 

            return {
                amperage: Math.round(targetAmperage),
                voltage: referenceVoltage.toFixed(1),
                wfs: digValue.toFixed(0), 
                gas: "None (Manual Flux Shielding Slag)",
                vBar: Math.min(Math.max(((targetAmperage - 50) / 150) * 100, 10), 100) + "%",
                wfsBar: digValue + "%",
                primaryVal: Math.round(targetAmperage) + " Amps",
                secondaryVal: digValue.toFixed(0) + " % Dig",
                wireDiameter: rodDiameter
            };
        },
        renderMathReport: function(s, specs) {
            return `<div class="p-4 bg-zinc-900 rounded-xl font-mono text-sm text-orange-400">SMAW Engine Output Active. Calculated Constant: ${specs.amperage} Amps</div>`;
        }
    }
};

function switchProcess(proc) {
    activeProcess = proc;
    const gmawBtn = document.getElementById('proc-btn-gmaw');
    const smawBtn = document.getElementById('proc-btn-smaw');
    const consLabel = document.getElementById('label-consumable');
    const primLabel = document.getElementById('label-primary-display');
    const secLabel = document.getElementById('label-secondary-display');
    const coachTitleA = document.getElementById('coach-title-primary');
    const coachTitleC = document.getElementById('coach-title-tertiary');
    const sizeWrapper = document.getElementById('weld-size-wrapper');
    const bgGlow = document.getElementById('bg-glow');

    if (proc === 'gmaw') {
        document.documentElement.style.setProperty('--theme-primary', '59 130 246');
        document.documentElement.style.setProperty('--theme-primary-hover', '37 99 235');
        if (bgGlow) bgGlow.style.background = "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.1) 0%, #09090b 100%)";
        if (gmawBtn) gmawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all bg-theme text-zinc-950 cursor-pointer";
        if (smawBtn) smawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer";
        if (consLabel) consLabel.innerText = "Wire Type";
        if (primLabel) primLabel.innerText = "Wire Voltage";
        if (secLabel) secLabel.innerText = "Wire Feed Speed";
        if (coachTitleA) coachTitleA.innerText = "Bead Manipulation (Stringer vs Weave)";
        if (coachTitleC) coachTitleC.innerText = "Torch Stick-Out (Distance from tip to work)";
        if (sizeWrapper) sizeWrapper.classList.remove('hidden');
    } else {
        document.documentElement.style.setProperty('--theme-primary', '249 115 22');
        document.documentElement.style.setProperty('--theme-primary-hover', '234 88 12');
        if (bgGlow) bgGlow.style.background = "radial-gradient(ellipse at center, rgba(249, 115, 22, 0.1) 0%, #09090b 100%)";
        if (smawBtn) smawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all bg-theme text-zinc-950 cursor-pointer";
        if (gmawBtn) gmawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer";
        if (consLabel) consLabel.innerText = "Electrode Rod";
        if (primLabel) primLabel.innerText = "Target Amperage";
        if (secLabel) secLabel.innerText = "Arc Force / Dig";
        if (coachTitleA) coachTitleA.innerText = "Rod Manipulation (Stringer vs Whip Technique)";
        if (coachTitleC) coachTitleC.innerText = "Arc Length Control (Distance from core to work)";
        if (sizeWrapper) sizeWrapper.classList.add('hidden');
    }
    
    updateDropdownOptions();
    
    const wireSelect = document.getElementById('select-wire');
    if (wireSelect) {
        wireSelect.value = proc === "gmaw" ? "1.0mm ER70S-6" : "3.2mm E7018";
    }

    if (isPanelOpen) renderInitialResponse();
}

function updateDropdownOptions() {
    const position = document.getElementById('select-position').value;
    const jointSelect = document.getElementById('select-joint');
    const profileSelect = document.getElementById('select-profile');
    const wireSelect = document.getElementById('select-wire');
    const machineSelect = document.getElementById('select-machine');
    const thicknessLabel = document.getElementById('label-thickness');
    const jointLabel = document.getElementById('label-joint');
    const profileLabel = document.getElementById('label-profile');
    
    const prevJoint = jointSelect ? jointSelect.value : "";
    const prevProfile = profileSelect ? profileSelect.value : "";
    const prevWire = wireSelect ? wireSelect.value : "";
    const prevMachine = machineSelect ? machineSelect.value : "";

    if (!jointSelect || !profileSelect || !wireSelect || !machineSelect) return;

    if (activeProcess === "gmaw") {
        if (thicknessLabel) thicknessLabel.innerText = "Thickness";
        if (position === "6G") {
            if (jointLabel) jointLabel.innerText = "Joint Design";
            if (profileLabel) profileLabel.innerText = "Pipe Schedule / Wall";
            jointSelect.innerHTML = `<option value="Open Root V-Groove">Open Root V-Groove</option><option value="V-Groove with Backing">V-Groove with Backing Ring</option>`;
            profileSelect.innerHTML = `<option value="Sch 40 Multi-Pass">Sch 40 / Standard Wall (Multi-Pass)</option><option value="Sch 80 Multi-Pass">Sch 80 / Extra Heavy (Multi-Pass Matrix)</option>`;
        } else {
            if (jointLabel) jointLabel.innerText = "Joint Type";
            if (profileLabel) profileLabel.innerText = "Weld Size";
            jointSelect.innerHTML = `<option value="T-Fillet">T-Fillet Joint</option><option value="Butt Weld">Butt Weld (V-Groove)</option><option value="Open Corner">Open Corner Joint</option><option value="Lap Joint">Lap Joint</option>`;
            profileSelect.innerHTML = `<option value="6mm Single-Pass">6mm Single-Pass Fillet</option><option value="8mm Single-Pass">8mm Single-Pass Fillet</option><option value="8mm Multi-Pass">8mm Multi-Pass (Root + Cap)</option><option value="10mm Multi-Pass">10mm Multi-Pass (3-Pass Run)</option><option value="12mm Multi-Pass">12mm Multi-Pass (Multi-Layer Matrix)</option>`;
        }
        wireSelect.innerHTML = `
            <optgroup label="Solid Wire (GMAW)" class="bg-zinc-900 text-zinc-400">
                <option value="1.0mm ER70S-6">1.0mm ER70S-6 Solid Wire</option>
                <option value="1.2mm ER70S-6">1.2mm ER70S-6 Solid Wire</option>
            </optgroup>
            <optgroup label="Gas-Shielded Flux-Cored (FCAW-G)" class="bg-zinc-900 text-zinc-400">
                <option value="1.2mm E71T-1M">1.2mm E71T-1M Cored Slag Wire</option>
                <option value="1.6mm E71T-1M">1.6mm E71T-1M Cored Slag Wire</option>
            </optgroup>
        `;
        machineSelect.innerHTML = `
            <option value="Generic Standard CV Box">Standard Plant Set</option>
            <option value="ESAB Warrior">ESAB Warrior (400i/500i)</option>
            <option value="Miller XMT">Miller XMT Set (350/450 Inverter)</option>
        `;
    } else {
        if (position === "6G") {
            if (thicknessLabel) thicknessLabel.innerText = "Pipe Spec";
            if (jointLabel) jointLabel.innerText = "Joint Design";
            if (profileLabel) profileLabel.innerText = "Pipe Schedule / Wall";
            jointSelect.innerHTML = `<option value="Open Root V-Groove">Open Root V-Groove</option><option value="V-Groove with Backing">V-Groove with Backing Ring</option>`;
            profileSelect.innerHTML = `<option value="Sch 40 Multi-Pass">Sch 40 Standard Wall (Multi-Pass)</option><option value="Sch 80 Multi-Pass">Sch 80 Extra Heavy (Multi-Pass)</option>`;
        } else {
            if (thicknessLabel) thicknessLabel.innerText = "Thickness";
            if (jointLabel) jointLabel.innerText = "Joint Type";
            if (profileLabel) profileLabel.innerText = "Pass Count Profile";
            jointSelect.innerHTML = `<option value="T-Fillet">T-Fillet Joint</option><option value="Butt Weld">Butt Weld (V-Groove)</option><option value="Lap Joint">Lap Joint</option>`;
            profileSelect.innerHTML = `<option value="Single-Pass Run">Single-Pass Heavy Run</option><option value="Multi-Pass Layering">Multi-Pass Structural Stacking</option>`;
        }
        wireSelect.innerHTML = `
            <optgroup label="Low Hydrogen Structural (SMAW)" class="bg-zinc-900 text-zinc-400">
                <option value="3.2mm E7018">3.2mm E7018 Structural Rod</option>
                <option value="2.5mm E7018">2.5mm E7018 Structural Rod</option>
                <option value="4.0mm E7018">4.0mm E7018 Structural Rod</option>
            </optgroup>
            <optgroup label="Cellulosic Pipe Root (SMAW)" class="bg-zinc-900 text-zinc-400">
                <option value="2.5mm E6010">2.5mm E6010 Deep-Dig Rod</option>
                <option value="3.2mm E6010">3.2mm E6010 Deep-Dig Rod</option>
            </optgroup>
        `;
        machineSelect.innerHTML = `
            <option value="Generic Standard CC Set">Standard CC Inverter Set</option>
            <option value="Lincoln Vantage">Lincoln Vantage Diesel Plant</option>
            <option value="Lincoln SA-200">Lincoln SA-200 Classic Generator</option>
            <option value="ESAB Warrior">ESAB Warrior (400i/500i)</option>
            <option value="Miller XMT">Miller XMT Set (350/450 Inverter)</option>
        `;
    }
    
    if (jointSelect.querySelector(`option[value="${prevJoint}"]`)) jointSelect.value = prevJoint;
    if (profileSelect.querySelector(`option[value="${prevProfile}"]`)) profileSelect.value = prevProfile;
    if (wireSelect.querySelector(`option[value="${prevWire}"]`)) wireSelect.value = prevWire;
    if (machineSelect.querySelector(`option[value="${prevMachine}"]`)) machineSelect.value = prevMachine;
}

function injectParam() {
    updateDropdownOptions(); 
    if (isPanelOpen) renderInitialResponse();
}

function handleSubmit() {
    const panel = document.getElementById('results-panel');
    if (panel) {
        panel.style.transform = 'translateY(0)'; 
        panel.classList.remove('translate-y-full');
        panel.classList.add('translate-y-0');
    }
    isPanelOpen = true;
    renderInitialResponse();
}

function minimizeResultsPanel() {
    const panel = document.getElementById('results-panel');
    if (panel) {
        panel.style.transform = 'translateY(100%)'; 
        panel.classList.remove('translate-y-0');
        panel.classList.add('translate-y-full');
    }
    isPanelOpen = false;
}

function openMathDashboard() {
    const s = getSelectedValues();
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    
    const mathContainer = document.getElementById('math-content-area');
    if (mathContainer) mathContainer.innerHTML = currentEngine.renderMathReport(s, specs);

    const mathPanel = document.getElementById('math-panel');
    if (mathPanel) {
        mathPanel.classList.remove('translate-y-full');
        mathPanel.classList.add('translate-y-0');
    }
    isMathPanelOpen = true;
}

function minimizeMathPanel() {
    const mathPanel = document.getElementById('math-panel');
    if (mathPanel) {
        mathPanel.classList.remove('translate-y-0');
        mathPanel.classList.add('translate-y-full');
    }
    isMathPanelOpen = false;
}

function calculateRealtimeHeatInput(shouldLog = false) {
    const v = parseFloat(document.getElementById('hi-volt').value) || 0;
    const a = parseFloat(document.getElementById('hi-amp').value) || 0;
    const ts = parseFloat(document.getElementById('hi-ts').value) || 0;
    if (!v || !a || !ts) return;
    const heatInput = (v * a * 60) / (ts * 1000);
    const resultField = document.getElementById('hi-result');
    if (resultField) resultField.innerText = heatInput.toFixed(2) + " kJ/mm";
}

function handleReset() {
    minimizeResultsPanel();
    minimizeMathPanel();
    const inputArea = document.getElementById('user-input');
    if (inputArea) inputArea.value = '';
    
    const thicknessField = document.getElementById('select-thickness');
    const positionField = document.getElementById('select-position');
    if (thicknessField) thicknessField.value = '6mm';
    if (positionField) positionField.value = '1G';
    
    updateDropdownOptions();
    const chatField = document.getElementById('chat-thread');
    if (chatField) chatField.innerHTML = '';
}

function renderInitialResponse() {
    const s = getSelectedValues();
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    
    const reqDisplay = document.getElementById('target-requirements-display');
    if (reqDisplay) reqDisplay.innerText = `${s.thickness} // ${s.position} // ${s.wire}`;

    document.getElementById('display-volt').innerText = specs.primaryVal;
    document.getElementById('bar-volt').style.width = specs.vBar;
    document.getElementById('display-wfs').innerText = specs.secondaryVal;
    document.getElementById('bar-wfs').style.width = specs.wfsBar;
    document.getElementById('display-gas').innerText = specs.gas;

    document.getElementById('hi-volt').value = parseFloat(specs.voltage) || 0;
    document.getElementById('hi-amp').value = parseInt(specs.amperage) || 0;

    const validationBanner = document.getElementById('rod-validation-banner');
    const validationText = document.getElementById('rod-validation-text');

    if (activeProcess === "smaw" && s.wire) {
        const isGrooveRootRun = s.joint && (s.joint.includes("Root") || s.joint.includes("V-Groove") || s.position === "6G");
        const isRunningCellulose = s.wire.includes("E6010");
        const isRunningL
