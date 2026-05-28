const parseBold = (str) => {
    if (!str) return '';
    return str.replace(/\*\*(.*?)\*\//g, '<strong>$1</strong>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
};

let isPanelOpen = false;
let isMathPanelOpen = false; 
let isTutorialVisible = false; 
let activeProcess = "gmaw"; 
let runHistory = []; 

document.addEventListener("DOMContentLoaded", () => {
    const savedLogs = localStorage.getItem("weldBuddyHistory");
    if (savedLogs) {
        try { runHistory = JSON.parse(savedLogs); } catch(e) { console.error(e); }
    }
    updateDropdownOptions(); 
});

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

            let minAmp = 130; let maxAmp = 330;
            if (s.wire && s.wire.includes("ER70S-6")) {
                if (isOutOfPosition) {
                    minAmp = wireDiameter === 1.0 ? 85 : 105; maxAmp = wireDiameter === 1.0 ? 125 : 145;
                } else {
                    minAmp = wireDiameter === 1.0 ? 150 : 180; maxAmp = wireDiameter === 1.0 ? 220 : 280;
                }
            } else if (s.wire && s.wire.includes("E71T-1M")) {
                minAmp = wireDiameter === 1.2 ? 130 : 160;
                maxAmp = isOutOfPosition ? (wireDiameter === 1.2 ? 190 : 210) : (wireDiameter === 1.2 ? 270 : 320);
            }

            targetAmperage = Math.min(Math.max(targetAmperage, minAmp), maxAmp);
            let jointModifier = 1.0;
            if (s.joint && (s.joint.includes("Root") || s.joint.includes("Butt"))) jointModifier = 0.94;

            let computedVoltage = (14 + (0.05 * targetAmperage)) * jointModifier;
            if (s.wire && s.wire.includes("E71T-1M")) {
                computedVoltage = isOutOfPosition ? (14 + (0.045 * targetAmperage) + 1.5) : computedVoltage + 3.5;
            } else if (s.wire && s.wire.includes("ER70S-6")) {
                computedVoltage = isOutOfPosition ? (14 + (0.035 * targetAmperage) + 0.6) : computedVoltage + 1.0;
            }

            let area = Math.PI * Math.pow((wireDiameter / 2), 2);
            let computedWFS = Math.min(Math.max((targetAmperage * 0.038) / area, 3.0), 13.5);
            let gasSetup = s.wire && s.wire.includes("E71T-1M") ? "18-22 L/min (80/20 Ar/CO₂ Mix)" : "14-18 L/min (92/8 Argon Mix)";

            return {
                amperage: Math.round(targetAmperage), voltage: computedVoltage.toFixed(1), wfs: computedWFS.toFixed(1), gas: gasSetup,
                vBar: Math.min(Math.max(((computedVoltage - 14) / 21) * 100, 10), 100) + "%",
                wfsBar: Math.min(Math.max(((computedWFS - 3.5) / 11.5) * 100, 10), 100) + "%",
                primaryVal: computedVoltage.toFixed(1) + " V", secondaryVal: computedWFS.toFixed(1) + " m/min", wireDiameter: wireDiameter
            };
        },
        renderMathReport: function(s, specs) {
            return `<div class="p-4 bg-zinc-900 rounded-xl font-mono text-sm text-blue-400">GMAW Core Matrix Engaged. Calculated Output: ${specs.amperage} Amps</div>`;
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

            let minAmp = 50; let maxAmp = 220;
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
                amperage: Math.round(targetAmperage), voltage: referenceVoltage.toFixed(1), wfs: digValue.toFixed(0), gas: "None (Flux Coating Shield)",
                vBar: Math.min(Math.max(((targetAmperage - 50) / 150) * 100, 10), 100) + "%", wfsBar: digValue + "%",
                primaryVal: Math.round(targetAmperage) + " Amps", secondaryVal: digValue.toFixed(0) + " % Dig", wireDiameter: rodDiameter
            };
        },
        renderMathReport: function(s, specs) {
            return `<div class="p-4 bg-zinc-900 rounded-xl font-mono text-sm text-orange-400">SMAW Core Matrix Engaged. Calculated Output: ${specs.amperage} Amps</div>`;
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
        if (bgGlow) bgGlow.style.background = "radial-gradient(ellipse at center, rgba(59, 130, 246, 0.1) 0%, #09090b 100%)";
        if (gmawBtn) gmawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all bg-theme text-zinc-950 cursor-pointer";
        if (smawBtn) smawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer";
        consLabel.innerText = "Wire Type"; primLabel.innerText = "Wire Voltage"; secLabel.innerText = "Wire Feed Speed";
        coachTitleA.innerText = "Bead Manipulation (Stringer vs Weave)"; coachTitleC.innerText = "Torch Stick-Out (Distance from tip to work)";
        sizeWrapper.classList.remove('hidden');
    } else {
        document.documentElement.style.setProperty('--theme-primary', '249 115 22');
        if (bgGlow) bgGlow.style.background = "radial-gradient(ellipse at center, rgba(249, 115, 22, 0.1) 0%, #09090b 100%)";
        if (smawBtn) smawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all bg-theme text-zinc-950 cursor-pointer";
        if (gmawBtn) gmawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer";
        consLabel.innerText = "Electrode Rod"; primLabel.innerText = "Target Amperage"; secLabel.innerText = "Arc Force / Dig";
        coachTitleA.innerText = "Rod Manipulation (Stringer vs Whip Technique)"; coachTitleC.innerText = "Arc Length Control (Distance from core to work)";
        sizeWrapper.classList.add('hidden');
    }
    updateDropdownOptions();
    document.getElementById('select-wire').value = proc === "gmaw" ? "1.0mm ER70S-6" : "3.2mm E7018";
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
            jointLabel.innerText = "Joint Design"; profileLabel.innerText = "Pipe Schedule / Wall";
            jointSelect.innerHTML = `<option value="Open Root V-Groove">Open Root V-Groove</option><option value="V-Groove with Backing">V-Groove with Backing Ring</option>`;
            profileSelect.innerHTML = `<option value="Sch 40 Multi-Pass">Sch 40 / Standard Wall (Multi-Pass)</option><option value="Sch 80 Multi-Pass">Sch 80 / Extra Heavy (Multi-Pass Matrix)</option>`;
        } else {
            jointLabel.innerText = "Joint Type"; profileLabel.innerText = "Weld Size";
            jointSelect.innerHTML = `<option value="T-Fillet">T-Fillet Joint</option><option value="Butt Weld">Butt Weld (V-Groove)</option><option value="Lap Joint">Lap Joint</option>`;
            profileSelect.innerHTML = `<option value="6mm Single-Pass">6mm Single-Pass Fillet</option><option value="8mm Multi-Pass">8mm Multi-Pass (Root + Cap)</option>`;
        }
        wireSelect.innerHTML = `<optgroup label="Solid Wire" class="bg-zinc-900"><option value="1.0mm ER70S-6">1.0mm ER70S-6</option><option value="1.2mm ER70S-6">1.2mm ER70S-6</option></optgroup>`;
        machineSelect.innerHTML = `<option value="Standard Box">Standard Plant Set</option><option value="ESAB Warrior">ESAB Warrior</option><option value="Miller XMT">Miller XMT Set</option>`;
    } else {
        if (position === "6G") {
            if (thicknessLabel) thicknessLabel.innerText = "Pipe Spec";
            jointLabel.innerText = "Joint Design"; profileLabel.innerText = "Pipe Schedule / Wall";
            jointSelect.innerHTML = `<option value="Open Root V-Groove">Open Root V-Groove</option><option value="V-Groove with Backing">V-Groove with Backing Ring</option>`;
            profileSelect.innerHTML = `<option value="Sch 40 Multi-Pass">Sch 40 Standard Wall</option><option value="Sch 80 Multi-Pass">Sch 80 Extra Heavy</option>`;
        } else {
            if (thicknessLabel) thicknessLabel.innerText = "Thickness";
            jointLabel.innerText = "Joint Type"; profileLabel.innerText = "Pass Count Profile";
            jointSelect.innerHTML = `<option value="T-Fillet">T-Fillet Joint</option><option value="Butt Weld">Butt Weld (V-Groove)</option><option value="Lap Joint">Lap Joint</option>`;
            profileSelect.innerHTML = `<option value="Single-Pass Run">Single-Pass Heavy Run</option><option value="Multi-Pass Layering">Multi-Pass Structural Stacking</option>`;
        }
        wireSelect.innerHTML = `<optgroup label="Low Hydrogen" class="bg-zinc-900"><option value="3.2mm E7018">3.2mm E7018</option><option value="2.5mm E7018">2.5mm E7018</option></optgroup><optgroup label="Cellulosic" class="bg-zinc-900"><option value="2.5mm E6010">2.5mm E6010</option><option value="3.2mm E6010">3.2mm E6010</option></optgroup>`;
        machineSelect.innerHTML = `<option value="Standard CC">Standard CC Set</option><option value="Lincoln Vantage">Lincoln Vantage Diesel</option><option value="Lincoln SA-200">Lincoln SA-200 Pure Gen</option>`;
    }
    if (jointSelect.querySelector(`option[value="${prevJoint}"]`)) jointSelect.value = prevJoint;
    if (profileSelect.querySelector(`option[value="${prevProfile}"]`)) profileSelect.value = prevProfile;
    if (wireSelect.querySelector(`option[value="${prevWire}"]`)) wireSelect.value = prevWire;
    if (machineSelect.querySelector(`option[value="${prevMachine}"]`)) machineSelect.value = prevMachine;
}

function injectParam() { updateDropdownOptions(); if (isPanelOpen) renderInitialResponse(); }
function handleSubmit() { document.getElementById('results-panel').style.transform = 'translateY(0)'; isPanelOpen = true; renderInitialResponse(); }
function minimizeResultsPanel() { document.getElementById('results-panel').style.transform = 'translateY(100%)'; isPanelOpen = false; }
function openMathDashboard() { const s = getSelectedValues(); const specs = WeldingProcessRegistry[activeProcess].calculate(s); document.getElementById('math-content-area').innerHTML = WeldingProcessRegistry[activeProcess].renderMathReport(s, specs); document.getElementById('math-panel').style.transform = 'translateY(0)'; isMathPanelOpen = true; }
function minimizeMathPanel() { document.getElementById('math-panel').style.transform = 'translateY(100%)'; isMathPanelOpen = false; }
function handleReset() { minimizeResultsPanel(); minimizeMathPanel(); document.getElementById('user-input').value = ''; updateDropdownOptions(); }

function renderInitialResponse() {
    const s = getSelectedValues();
    const specs = WeldingProcessRegistry[activeProcess].calculate(s);
    document.getElementById('target-requirements-display').innerText = `${s.thickness} // ${s.position} // ${s.wire}`;
    document.getElementById('display-volt').innerText = specs.primaryVal;
    document.getElementById('bar-volt').style.width = specs.vBar;
    document.getElementById('display-wfs').innerText = specs.secondaryVal;
    document.getElementById('bar-wfs').style.width = specs.wfsBar;
    document.getElementById('display-gas').innerText = specs.gas;

    const validationBanner = document.getElementById('rod-validation-banner');
    const validationText = document.getElementById('rod-validation-text');
    if (activeProcess === "smaw" && s.wire) {
        const isRootRun = s.joint && (s.joint.includes("Root") || s.joint.includes("V-Groove") || s.position === "6G");
        if (isRootRun && s.wire.includes("E7018")) {
            validationText.innerHTML = `Your parameters specify an open-root groove or critical 6G pipe run, but you have an **E7018 low-hydrogen rod** loaded. For optimized structural safety on Pass 1, consider burning a fast-freezing **2.5mm or 3.2mm E6010 cellulosic rod** to achieve full root penetration before filling with E7018.`;
            validationBanner.classList.remove('hidden');
        } else if (!isRootRun && s.wire.includes("E6010")) {
            validationText.innerHTML = `You have an aggressive **E6010 deep-digging rod** selected for a solid structural fillet or lap joint. For non-open-gap structural elements, switch to an **E7018 low-hydrogen electrode** to guarantee optimum mechanical yield metrics.`;
            validationBanner.classList.remove('hidden');
        } else { validationBanner.classList.add('hidden'); }
    } else { if (validationBanner) validationBanner.classList.add('hidden'); }

    const mpSection = document.getElementById('multi-pass-section');
    if (s.profile && (s.profile.includes("Multi-Pass") || s.profile.includes("Layering"))) {
        let baseAmp = parseInt(specs.amperage) || 90;
        if (activeProcess === "gmaw") {
            let parsedVolt = parseFloat(specs.voltage) || 0; let parsedWfs = parseFloat(specs.wfs) || 0;
            document.getElementById('mp-pass1').innerText = `${(parsedVolt - 1.5).toFixed(1)}V @ ${(parsedWfs - 1.0).toFixed(1)}m`;
            document.getElementById('mp-pass2').innerText = `${specs.voltage}V @ ${specs.wfs}m`;
            document.getElementById('mp-pass3').innerText = `${(parsedVolt - 0.5).toFixed(1)}V @ ${(parsedWfs - 0.4).toFixed(1)}m`;
            document.getElementById('mp-pass1-advice').innerText = "Deep root penetration run."; document.getElementById('mp-pass2-advice').innerText = "Fill pass layers."; document.getElementById('mp-pass3-advice').innerText = "Cap layer pass.";
        } else {
            let rootRod = s.wire; let fillRod = s.wire; let capRod = s.wire;
            if (s.joint && (s.joint.includes("Root") || s.position === "6G")) { rootRod = "2.5mm E6010 (Whip Pass)"; fillRod = "3.2mm E7018 Low-H2"; capRod = "3.2mm E7018 Low-H2"; }
            document.getElementById('mp-pass1').innerText = `${Math.round(baseAmp * 0.90)} Amps ➔ Rod: ${rootRod}`;
            document.getElementById('mp-pass2').innerText = `${baseAmp} Amps ➔ Rod: ${fillRod}`;
            document.getElementById('mp-pass3').innerText = `${Math.round(baseAmp * 0.94)} Amps ➔ Rod: ${capRod}`;
            document.getElementById('mp-pass1-advice').innerText = "Root pass current dropped 10% for hole containment."; document.getElementById('mp-pass2-advice').innerText = "Fill current at 100% capacity."; document.getElementById('mp-pass3-advice').innerText = "Cap current dropped 6% to eliminate toe undercut.";
        }
        mpSection.classList.remove('hidden');
    } else { if (mpSection) mpSection.classList.add('hidden'); }

    document.getElementById('coach-bead-text').innerHTML = activeProcess === "gmaw" ? "Run clean stringers." : "Maintain a tight arc length.";
    document.getElementById('coach-angle-text').innerHTML = "Maintain 45° splits for fillets, 90° down root faces.";
    document.getElementById('coach-stickout-text').innerHTML = activeProcess === "gmaw" ? "Keep stick-out short (10-12mm)." : "Hold short arc length matching core rod diameter size.";
}

function switchTab(tab) {
    const specsBtn = document.getElementById('tab-specs-btn'); const techBtn = document.getElementById('tab-tech-btn');
    const specsPanel = document.getElementById('panel-specs'); const techPanel = document.getElementById('panel-tech');
    if (tab === 'specs') {
        specsBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all cursor-pointer"; techBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all cursor-pointer";
        specsPanel.classList.remove('hidden'); techPanel.classList.add('hidden');
    } else {
        techBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all cursor-pointer"; specsBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all cursor-pointer";
        specsPanel.classList.add('hidden'); techPanel.classList.remove('hidden');
    }
}
function triggerQuickTroubleshoot(defect) { document.getElementById('follow-up-input').value = `How do I eliminate structural ${defect}?`; sendFollowUp(); }
function sendFollowUp() { /* Keeps layout active */ }
