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
            let baseThicknessVal = parseInt(s.thickness) || 6;
            if (s.thickness === "25mm+") baseThicknessVal = 28;
            return `
                <div class="space-y-4 font-mono text-sm text-blue-400">
                    <div>• GMAW Calculator Core Active</div>
                    <div>• Computed Structural Base: ${baseThicknessVal}mm Plate</div>
                    <div class="text-emerald-400 font-bold">• Calculated Safe Output: ${specs.amperage} Amps</div>
                </div>`;
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
                gas: "None (Manual Flux Covering Slag Shield)",
                vBar: Math.min(Math.max(((targetAmperage - 50) / 150) * 100, 10), 100) + "%",
                wfsBar: digValue + "%",
                primaryVal: Math.round(targetAmperage) + " Amps",
                secondaryVal: digValue.toFixed(0) + " % Dig",
                wireDiameter: rodDiameter
            };
        },
        renderMathReport: function(s, specs) {
            return `
                <div class="space-y-4 font-mono text-sm text-orange-400">
                    <div>• SMAW Engine Core Active</div>
                    <div>• Constant Density Scale: Core Wire Diameter Base</div>
                    <div class="text-emerald-400 font-bold">• Core Structural Output Amps: ${specs.amperage} A</div>
                </div>`;
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
        consLabel.innerText = "Wire Type";
        primLabel.innerText = "Wire Voltage";
        secLabel.innerText = "Wire Feed Speed";
        coachTitleA.innerText = "Bead Manipulation (Stringer vs Weave)";
        coachTitleC.innerText = "Torch Stick-Out (Distance from tip to work)";
        if (sizeWrapper) sizeWrapper.classList.remove('hidden');
    } else {
        document.documentElement.style.setProperty('--theme-primary', '249 115 22');
        document.documentElement.style.setProperty('--theme-primary-hover', '234 88 12');
        if (bgGlow) bgGlow.style.background = "radial-gradient(ellipse at center, rgba(249, 115, 22, 0.1) 0%, #09090b 100%)";
        if (smawBtn) smawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all bg-theme text-zinc-950 cursor-pointer";
        if (gmawBtn) gmawBtn.className = "py-2.5 rounded-lg text-sm font-bold uppercase tracking-wider transition-all text-zinc-400 hover:text-zinc-200 cursor-pointer";
        consLabel.innerText = "Electrode Rod";
        primLabel.innerText = "Target Amperage";
        secLabel.innerText = "Arc Force / Dig";
        coachTitleA.innerText = "Rod Manipulation (Stringer vs Whip Technique)";
        coachTitleC.innerText = "Arc Length Control (Distance from core to work)";
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
    const positionSelect = document.getElementById('select-position');
    if (!positionSelect) return;
    const position = positionSelect.value;
    
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
            <optgroup label="Gasless Flux-Cored (FCAW-S)" class="bg-zinc-900 text-zinc-400">
                <option value="1.6mm E71T-8">1.6mm E71T-8 Gasless Wire</option>
                <option value="2.0mm E71T-8">2.0mm E71T-8 Gasless Wire</option>
            </optgroup>
        `;
        machineSelect.innerHTML = `
            <option value="Generic Standard CV Box">Standard Plant Set</option>
            <optgroup label="ESAB Welder Line" class="bg-zinc-900 text-zinc-400">
                <option value="ESAB Warrior">ESAB Warrior (400i/500i)</option>
                <option value="ESAB Fabricator">ESAB Fabricator EM (401i/501i)</option>
                <option value="ESAB Rebel">ESAB Rebel (235ic/320ic)</option>
                <option value="ESAB Aristo">ESAB Aristo Mig (400i/500i)</option>
            </optgroup>
            <optgroup label="Miller Welder Line" class="bg-zinc-900 text-zinc-400">
                <option value="Miller XMT">Miller XMT Set (350/450 Inverter)</option>
                <option value="Miller Delta-Weld">Miller Delta-Weld Workshop Unit</option>
                <option value="Miller Invision">Miller Invision (352/452 MPa)</option>
                <option value="Miller Dimension">Miller Dimension 650 Station</option>
            </optgroup>
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
            <optgroup label="Field Engine Drives" class="bg-zinc-900 text-zinc-400">
                <option value="Lincoln Vantage">Lincoln Vantage Diesel Plant</option>
                <option value="Miller Trailblazer">Miller Trailblazer (325 Drive)</option>
                <option value="Lincoln SA-200">Lincoln SA-200 Classic Generator</option>
            </optgroup>
            <optgroup label="Portable Field Inverters" class="bg-zinc-900 text-zinc-400">
                <option value="Kemppi Minarc">Kemppi Minarc Site Pack</option>
                <option value="Miller Maxstar">Miller Maxstar Portable Box</option>
            </optgroup>
        `;
    }
    
    if (jointSelect.querySelector(`option[value="${prevJoint}"]`)) jointSelect.value = prevJoint;
    if (profileSelect.querySelector(`option[value="${prevProfile}"]`)) profileSelect.value = prevProfile;
    if (wireSelect.querySelector(`option[value="${prevWire}"]`)) wireSelect.value = prevWire;
    if (machineSelect.querySelector(`option[value="${prevMachine}"]`)) machineSelect.value = prevMachine;
}

function injectParam() { updateDropdownOptions(); if (isPanelOpen) renderInitialResponse(); }
function handleSubmit() { document.getElementById('results-panel').style.transform = 'translateY(0)'; isPanelOpen = true; renderInitialResponse(); }
function minimizeResultsPanel() { document.getElementById('results-panel').style.transform = 'translateY(100%)'; isPanelOpen = false; }
function openMathDashboard() { const s = getSelectedValues(); const currentEngine = WeldingProcessRegistry[activeProcess]; const specs = currentEngine.calculate(s); document.getElementById('math-content-area').innerHTML = currentEngine.renderMathReport(s, specs); document.getElementById('math-panel').style.transform = 'translateY(0)'; isMathPanelOpen = true; }
function minimizeMathPanel() { document.getElementById('math-panel').style.transform = 'translateY(100%)'; isMathPanelOpen = false; }

function calculateRealtimeHeatInput(shouldLog = false) {
    const v = parseFloat(document.getElementById('hi-volt').value) || 0;
    const a = parseFloat(document.getElementById('hi-amp').value) || 0;
    const ts = parseFloat(document.getElementById('hi-ts').value) || 0;
    if (!v || !a || !ts) return;
    const heatInput = (v * a * 60) / (ts * 1000);
    const outField = document.getElementById('hi-result');
    if (outField) outField.innerText = heatInput.toFixed(2) + " kJ/mm";
}

function handleReset() {
    minimizeResultsPanel(); minimizeMathPanel();
    document.getElementById('user-input').value = '';
    document.getElementById('select-thickness').value = '6mm';
    document.getElementById('select-position').value = '1G';
    updateDropdownOptions();
    document.getElementById('select-wire').value = activeProcess === "gmaw" ? "1.0mm ER70S-6" : "3.2mm E7018";
    document.getElementById('display-volt').innerText = "0.0 V";
    document.getElementById('bar-volt').style.width = "0%";
    document.getElementById('display-wfs').innerText = "0.0 m/min";
    document.getElementById('bar-wfs').style.width = "0%";
    document.getElementById('chat-thread').innerHTML = '';
    document.getElementById('shop-alert-banner').classList.add('hidden');
    document.getElementById('rod-validation-banner').classList.add('hidden');
}

function renderInitialResponse() {
    const s = getSelectedValues();
    const currentEngine = WeldingProcessRegistry[activeProcess];
    const specs = currentEngine.calculate(s);
    
    const requirementsBox = document.getElementById('target-requirements-display');
    if (requirementsBox) requirementsBox.innerText = `${s.thickness} // ${s.position} // ${s.wire}`;

    // AUTO-SWITCH ACCENT CAPTIONS DEPENDING ON THE BOOTH MODE SPECIFICATION
    const primLabel = document.getElementById('label-primary-display');
    const secLabel = document.getElementById('label-secondary-display');
    if (activeProcess === "gmaw") {
        if (primLabel) primLabel.innerText = "Wire Voltage";
        if (secLabel) secLabel.innerText = "Wire Feed Speed";
    } else {
        if (primLabel) primLabel.innerText = "Target Amperage";
        if (secLabel) secLabel.innerText = "Arc Force / Dig";
    }

    document.getElementById('display-volt').innerText = specs.primaryVal;
    document.getElementById('bar-volt').style.width = specs.vBar;
    document.getElementById('display-wfs').innerText = specs.secondaryVal;
    document.getElementById('bar-wfs').style.width = specs.wfsBar;
    document.getElementById('display-gas').innerText = specs.gas;

    const vInput = document.getElementById('hi-volt');
    const aInput = document.getElementById('hi-amp');
    if (vInput) vInput.value = parseFloat(specs.voltage) || 0;
    if (aInput) aInput.value = parseInt(specs.amperage) || 0;

    const validationBanner = document.getElementById('rod-validation-banner');
    const validationText = document.getElementById('rod-validation-text');
    let thicknessValue = parseInt(s.thickness) || 6;
    if (s.thickness === "25mm+") thicknessValue = 28;

    if (activeProcess === "smaw" && s.wire) {
        const isRootRun = s.joint && (s.joint.includes("Root") || s.joint.includes("V-Groove") || s.position === "6G");
        if (isRootRun && s.wire.includes("E7018")) {
            if (validationText) validationText.innerHTML = `Your parameters specify an open-root groove or critical 6G pipe run, but you have an **E7018 low-hydrogen rod** loaded. For optimized structural safety on Pass 1, consider burning a fast-freezing **2.5mm or 3.2mm E6010 cellulosic rod** to achieve full root penetration before filling with E7018.`;
            if (validationBanner) validationBanner.classList.remove('hidden');
        } else if (!isRootRun && s.wire.includes("E6010")) {
            if (validationText) validationText.innerHTML = `You have an aggressive **E6010 deep-digging rod** selected for a solid structural fillet or lap joint. For non-open-gap structural elements, switch to an **E7018 low-hydrogen electrode** to guarantee optimum mechanical yield metrics.`;
            if (validationBanner) validationBanner.classList.remove('hidden');
        } else { if (validationBanner) validationBanner.classList.add('hidden'); }
    } else { if (validationBanner) validationBanner.classList.add('hidden'); }

    const alertBanner = document.getElementById('shop-alert-banner');
    const alertTitle = document.getElementById('shop-alert-title');
    const alertText = document.getElementById('shop-alert-text');
    const isSinglePass = s.profile && s.profile.includes("Single-Pass");

    if (activeProcess === "gmaw" && thicknessValue >= 20 && specs.wireDiameter <= 1.0 && !isSinglePass) {
        if (alertBanner) alertBanner.className = "bg-blue-500/10 border border-blue-500/20 text-blue-300 p-4 rounded-xl text-base mb-4";
        if (alertTitle) alertTitle.innerText = "💡 Production Efficiency Tip:";
        if (alertText) alertText.innerText = "While 1.0mm wire easily achieves full code compliance via multi-pass stacking, stepping up to 1.2mm cored wire will significantly cut down your arc time.";
        if (alertBanner) alertBanner.classList.remove('hidden');
    } else { if (alertBanner) alertBanner.classList.add('hidden'); }

    const mpSection = document.getElementById('multi-pass-section');
    const mpAdvice1 = document.getElementById('mp-pass1-advice');
    const mpAdvice2 = document.getElementById('mp-pass2-advice');
    const mpAdvice3 = document.getElementById('mp-pass3-advice');

    if (s.profile && (s.profile.includes("Multi-Pass") || s.profile.includes("Layering"))) {
        let baseAmp = parseInt(specs.amperage) || 90;
        if (activeProcess === "gmaw") {
            let parsedVolt = parseFloat(specs.voltage) || 0; let parsedWfs = parseFloat(specs.wfs) || 0;
            document.getElementById('mp-pass1').innerText = `${(parsedVolt - 1.5).toFixed(1)}V @ ${(parsedWfs - 1.0).toFixed(1)}m`;
            document.getElementById('mp-pass2').innerText = `${specs.voltage}V @ ${specs.wfs}m`;
            document.getElementById('mp-pass3').innerText = `${(parsedVolt - 0.5).toFixed(1)}V @ ${(parsedWfs - 0.4).toFixed(1)}m`;
            if (mpAdvice1) mpAdvice1.innerText = "Deep root penetration run. Keep gun completely perpendicular.";
            if (mpAdvice2) mpAdvice2.innerText = "Fill pass layers. Maintain fluid wash on bevel borders.";
            if (mpAdvice3) mpAdvice3.innerText = "Cap layer pass. Keep travel swift to flatten reinforcing crown profile.";
        } else {
            let rootRod = s.wire; let fillRod = s.wire; let capRod = s.wire;
            if (s.joint && (s.joint.includes("Root") || s.position === "6G")) { rootRod = "2.5mm E6010 (Whip Pass)"; fillRod = "3.2mm E7018 Low-H2"; capRod = "3.2mm E7018 Low-H2"; }
            else if (thicknessValue >= 15 && s.wire.includes("E7018")) { fillRod = "4.0mm E7018 Heavy-Fill Electrode"; }
            document.getElementById('mp-pass1').innerText = `${Math.round(baseAmp * 0.90)} Amps ➔ Rod: ${rootRod}`;
            document.getElementById('mp-pass2').innerText = `${baseAmp} Amps ➔ Rod: ${fillRod}`;
            document.getElementById('mp-pass3').innerText = `${Math.round(baseAmp * 0.94)} Amps ➔ Rod: ${capRod}`;
            if (mpAdvice1) mpAdvice1.innerText = "Root pass current dropped 10% for thermal hole containment.";
            if (mpAdvice2) mpAdvice2.innerText = "Fill current running at 100% capacity threshold for structural side-wall fusion.";
            if (mpAdvice3) mpAdvice3.innerText = "Cap current dropped 6% to freeze manual pool mass and eliminate toe edge undercut.";
        }
        if (mpSection) mpSection.classList.remove('hidden');
    } else { if (mpSection) mpSection.classList.add('hidden'); }

    let rawBeadText = activeProcess === "gmaw" ? "Run clean stringers. Keep arc line leading corner concise." : "Maintain a tight arc length to stay beneath heavy fluid slag coverings.";
    let rawTorchText = "Maintain 45° splits for fillets, 90° straight down root faces.";
    let rawStickText = activeProcess === "gmaw" ? "Keep stick-out short (10-12mm)." : "Hold an arc length matching core rod diameter size.";

    if (activeProcess === "smaw" && s.wire) {
        if (s.wire.includes("E6010")) rawBeadText = "E6010 cellulosic rod features a severe digging force. Step forward one rod diameter length along the land line, then whip back halfway into your weld crater to freeze layers smoothly.";
    }

    document.getElementById('coach-bead-text').innerHTML = parseBold(rawBeadText);
    document.getElementById('coach-angle-text').innerHTML = parseBold(rawTorchText);
    document.getElementById('coach-stickout-text').innerHTML = parseBold(rawStickText);
}

function switchTab(tab) {
    const specsBtn = document.getElementById('tab-specs-btn'); const techBtn = document.getElementById('tab-tech-btn');
    const specsPanel = document.getElementById('panel-specs'); const techPanel = document.getElementById('panel-tech');
    if (tab === 'specs') {
        if (specsBtn) specsBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all cursor-pointer";
        if (techBtn) techBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all cursor-pointer";
        if (specsPanel) specsPanel.classList.remove('hidden'); if (techPanel) techPanel.classList.add('hidden');
    } else {
        if (techBtn) techBtn.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all cursor-pointer";
        if (specsBtn) specsBtn.className = "border-b-2 border-transparent text-zinc-500 hover:text-zinc-300 pb-3 transition-all cursor-pointer";
        if (specsPanel) specsPanel.classList.add('hidden'); if (techPanel) techPanel.className = "border-b-2 border-theme text-zinc-100 pb-3 transition-all cursor-pointer";
    }
}
function triggerQuickTroubleshoot(defect) { const entry = document.getElementById('follow-up-input'); if (entry) entry.value = `How do I eliminate structural ${defect}?`; sendFollowUp(); }
function sendFollowUp() {
    const input = document.getElementById('follow-up-input');
    const questionText = input ? input.value.trim() : ""; if (!questionText) return;
    const s = getSelectedValues(); const currentEngine = WeldingProcessRegistry[activeProcess]; const specs = currentEngine.calculate(s);
    const thread = document.getElementById('chat-thread'); if (!thread) return;
    thread.innerHTML += `<div class="flex justify-end mt-4"><span class="bg-purple-950/10 text-purple-400 text-base px-4 py-2 rounded-xl border border-purple-500/20 max-w-md font-medium">${questionText}</span></div>`;
    input.value = '';
    const API_KEY = "AIzaSyC1DHTraXG7xqzayZ4eAmfGzW9tKEvZp2U"; const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`;
    const processContextString = activeProcess === "gmaw" ? `- WIRE: ${s.wire}\n- VOLTAGE: ${specs.voltage}V\n- WFS: ${specs.wfs}m/min` : `- ROD: ${s.wire}\n- AMPS: ${specs.amperage}A\n- DIG: ${specs.wfs}%`;
    const systemInstruction = `You are WeldCoach, an elite industrial welding mentor. Provide rapid, concise troubleshooting bullet points under Machine Dial Tuning and Technique. Max 2 sentences per bullet. Context: ${activeProcess}, ${processContextString}.`;
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: `${systemInstruction}\n\nUser Question: ${questionText}` }] }] }) })
    .then(r => r.json()).then(data => {
        let aiReply = data.candidates[0].content.parts[0].text;
        thread.innerHTML += `<div class="bg-zinc-950 p-4 rounded-xl border border-zinc-800 mt-2 text-zinc-300 text-base space-y-2 text-left">${parseBold(aiReply).replace(/\n/g, '<br>')}</div>`;
    });
}
