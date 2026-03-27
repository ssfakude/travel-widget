// ============================================================
// FILE: Calculations/calculations.js
// Purpose: SCS Calculation Engine
//          Triggered ONLY on Quantity input (col 5) in #boqSubform
// Author:  Converted from Dinesh M. Zoho Deluge — SCS-Calc-Trigger
// ============================================================


// ── Column indexes for #boqSubform ─ ─────────────────────────
const BOQ_COL = {
    LINE        : 1,
    QUANTITY    : 5,   // ← ONLY trigger column
    GIRTH       : 6,
    THICKNESS   : 7,
    RATES       : 8,
    DISCOUNT    : 9,
    AMOUNT      : 10,  // ← written by calc
    GP          : 11,  // ← written by calc
    REVERSE_RATE: 12   // ← written by calc
};

// ── Column indexes for #materialsSubform ────────────────────
const MM_COL = {
    BOQ_LINE         : 1,
    QUANTITY         : 2,
    REVERSE_GP       : 3,
    REVERSE_RATE     : 4,   // ← written
    MAT_PRICE        : 7,
    EXCHANGE_RATE    : 9,
    DISCOUNT         : 10,
    FREIGHT          : 11,
    PRICE_PER_PAIL   : 12,  // ← written
    KEG_SIZE         : 13,
    MAT_COVERAGE     : 14,
    WASTAGE          : 15,
    ITEM_COVERAGE    : 16,  // ← written
    MAT_PRICE_UNIT   : 17,  // ← written
    KEG_NEEDED       : 18,  // ← written
    MAT_QUANTITY     : 19,  // ← written
    MAT_COST         : 20,  // ← written
    SOLVENT_PRICE    : 22,
    SOLVENT_SIZE     : 23,
    DILUTION         : 24,
    SOLVENT_NEEDED   : 25,  // ← written
    SOLVENT_QTY      : 26,  // ← written
    SOLVENT_COST     : 27,  // ← written
    MAT_LINE_COST    : 28,  // ← written
    UNIT_PER_MANDAY  : 29,
    MANDAY_COST      : 30,
    RS_PER_UNIT      : 31,  // ← written
    MANDAYS_FORECAST : 32,  // ← written
    TOTAL_MANDAY_COST: 33   // ← written
};


// ────────────────────────────────────────────────────────────
// DOM HELPERS
// ────────────────────────────────────────────────────────────

/** Read a numeric value from a table cell */
function calcGetNum(row, colIndex) {
    const el = row.cells[colIndex]?.querySelector('input, select');
    const v  = parseFloat(el?.value);
    return isNaN(v) ? 0 : v;
}

/** Read a string value from a table cell */
function calcGetStr(row, colIndex) {
    const el = row.cells[colIndex]?.querySelector('input, select');
    return (el?.value || '').trim();
}

/** Write a numeric value to a table cell input (4 decimal places) */
function calcSetNum(row, colIndex, value) {
    const el = row.cells[colIndex]?.querySelector('input');
    if (el) el.value = isNaN(value) ? '' : parseFloat(value.toFixed(4));
}

/** Write a string value to a table cell input */
function calcSetStr(row, colIndex, value) {
    const el = row.cells[colIndex]?.querySelector('input');
    if (el) el.value = (value !== null && value !== undefined) ? value : '';
}

/**
 * Format a quantity for display:
 * - Returns "n/a" when zero, null, or unit is "Fixed"
 * - Returns integer string when whole number
 * - Returns 2 decimal string otherwise
 * Mirrors Deluge: Material_Quantity_cons / Item_Coverage_cons / Keg_Size_cons
 */
function calcFmtDisplay(value, unit) {
    const n = parseFloat(value);
    if (!n || n === 0 || unit === 'Fixed') return 'n/a';
    const formatted = (n % 1 === 0) ? n.toFixed(0) : n.toFixed(2);
    return unit ? `${formatted} ${unit}` : formatted;
}


// ────────────────────────────────────────────────────────────
// CORE CALCULATION ENGINE
// Mirrors Deluge: SCS-Calc-Trigger + SCS_Calc function
// ────────────────────────────────────────────────────────────

function runSCSCalc() {

    const boqRows = document.querySelectorAll('#boqSubform tbody tr');
    const mmRows  = document.querySelectorAll('#materialsSubform tbody tr');

    // Read Consumables % from header (user-editable)
    const consumablesPct = parseFloat(
        document.getElementById('consumablesexclmiscField')?.value || 0
    );

    // ── SCS-level accumulators ───────────────────────────────
    let totalContractSum     = 0;
    let totalContractSumExcl = 0;
    let totalMatCost         = 0;
    let totalMatCostExcl     = 0;
    let totalLabourCost      = 0;
    let totalLabourCostExcl  = 0;
    let totalM2              = 0;
    let totalM2Excl          = 0;
    let totalMandays         = 0;
    let totalMandaysExcl     = 0;


    // ────────────────────────────────────────────────────────
    // STEP 1 — Calculate BOQ Amount for every BOQ row
    // ────────────────────────────────────────────────────────
    boqRows.forEach(boqRow => {
        const qty       = calcGetNum(boqRow, BOQ_COL.QUANTITY);
        const girth     = calcGetNum(boqRow, BOQ_COL.GIRTH);
        const thickness = calcGetNum(boqRow, BOQ_COL.THICKNESS);
        const rates     = calcGetNum(boqRow, BOQ_COL.RATES);
        const discount  = calcGetNum(boqRow, BOQ_COL.DISCOUNT);

        // Area = Qty × Girth × Thickness (apply only filled dimensions)
        let area = qty;
        if (girth > 0 && thickness > 0) area = qty * girth * thickness;
        else if (girth > 0)             area = qty * girth;

        // Amount = Area × Rates × (1 − Discount%)
        const amount = area * rates * (1 - discount / 100);
        calcSetNum(boqRow, BOQ_COL.AMOUNT, amount);

        // Accumulate — extend isMisc if a Miscellaneous column is added
        const isMisc = false;
        totalContractSum += amount;
        if (!isMisc) totalContractSumExcl += amount;
    });


    // ────────────────────────────────────────────────────────
    // STEP 2 — Calculate every Materials & Mandays row
    // ────────────────────────────────────────────────────────
    mmRows.forEach(mmRow => {
        const boqLineStr = calcGetStr(mmRow, MM_COL.BOQ_LINE);
        if (!boqLineStr) return; // skip rows with no BOQ Line

        // Find the matching BOQ row for this MM line
        let matchedBOQRow = null;
        boqRows.forEach(b => {
            if (calcGetStr(b, BOQ_COL.LINE) === boqLineStr) matchedBOQRow = b;
        });
        if (!matchedBOQRow) return;

        // Re-derive BOQ area (same formula as Step 1)
        const boqQty       = calcGetNum(matchedBOQRow, BOQ_COL.QUANTITY);
        const boqGirth     = calcGetNum(matchedBOQRow, BOQ_COL.GIRTH);
        const boqThickness = calcGetNum(matchedBOQRow, BOQ_COL.THICKNESS);
        const isMisc       = false; // extend if Misc column is added

        let boqArea = boqQty;
        if (boqGirth > 0 && boqThickness > 0) boqArea = boqQty * boqGirth * boqThickness;
        else if (boqGirth > 0)                 boqArea = boqQty * boqGirth;

        // MM Quantity multiplier × BOQ area = total paintable area for this row
        const mmQty     = calcGetNum(mmRow, MM_COL.QUANTITY);
        const totalArea = boqArea * mmQty;

        // ── Material inputs ───────────────────────────────────
        const reverseGP  = calcGetNum(mmRow, MM_COL.REVERSE_GP);
        const matPrice   = calcGetNum(mmRow, MM_COL.MAT_PRICE);
        const exchRate   = calcGetNum(mmRow, MM_COL.EXCHANGE_RATE) || 1;
        const discount   = calcGetNum(mmRow, MM_COL.DISCOUNT);
        const freight    = calcGetNum(mmRow, MM_COL.FREIGHT);
        const kegSize    = calcGetNum(mmRow, MM_COL.KEG_SIZE);
        const coverage   = calcGetNum(mmRow, MM_COL.MAT_COVERAGE);
        const wastage    = calcGetNum(mmRow, MM_COL.WASTAGE);
        const matUnit    = calcGetStr(mmRow, MM_COL.MAT_PRICE_UNIT); // unit string

        // ── Solvent inputs ────────────────────────────────────
        const solventPrice = calcGetNum(mmRow, MM_COL.SOLVENT_PRICE);
        const solventSize  = calcGetNum(mmRow, MM_COL.SOLVENT_SIZE);
        const dilution     = calcGetNum(mmRow, MM_COL.DILUTION);

        // ── Labour inputs ─────────────────────────────────────
        const unitPerManday = calcGetNum(mmRow, MM_COL.UNIT_PER_MANDAY);
        const mandayCost    = calcGetNum(mmRow, MM_COL.MANDAY_COST);


        // ── Price per Pail ────────────────────────────────────
        // = (MatPrice × ExchRate × (1 − Discount%)) + Freight
        const pricePerPail = (matPrice * exchRate * (1 - discount / 100)) + freight;

        // ── Effective Coverage (m² per litre after wastage) ──
        const effectiveCoverage = coverage * (1 - wastage / 100);

        // ── Item Coverage (m² per keg/pail) ──────────────────
        const itemCoverage = (effectiveCoverage > 0 && kegSize > 0)
            ? effectiveCoverage * kegSize
            : 0;

        // ── Material Price per Unit (cost per m²) ─────────────
        const matPricePerUnit = itemCoverage > 0
            ? pricePerPail / itemCoverage
            : 0;

        // ── Pails / Kegs Needed (always round up) ─────────────
        const pailNeeded = itemCoverage > 0
            ? Math.ceil(totalArea / itemCoverage)
            : 0;

        // ── Material Quantity (litres consumed) ───────────────
        const matQuantity = pailNeeded * kegSize;

        // ── Material Cost ─────────────────────────────────────
        const matCost = pailNeeded * pricePerPail;

        // ── Solvent Calculations ──────────────────────────────
        let solventNeeded = 0, solventQty = 0, solventCost = 0;
        if (solventSize > 0 && dilution > 0 && matQuantity > 0) {
            solventNeeded = Math.ceil((matQuantity * dilution / 100) / solventSize);
            solventQty    = solventNeeded * solventSize;
            solventCost   = solventNeeded * solventPrice;
        }

        // ── Material Line Cost ────────────────────────────────
        const matLineCost = matCost + solventCost;

        // ── Labour ───────────────────────────────────────────
        const rsPerUnit       = unitPerManday > 0 ? mandayCost  / unitPerManday : 0;
        const mandaysForecast = unitPerManday > 0 ? totalArea   / unitPerManday : 0;
        const totalMandayCost = mandaysForecast * mandayCost;

        // ── Reverse Rate ──────────────────────────────────────
        // = (MatLineCost + TotalMandayCost) / TotalArea / (1 − ReverseGP%)
        const reverseRate = (totalArea > 0 && reverseGP < 100)
            ? (matLineCost + totalMandayCost) / totalArea / (1 - reverseGP / 100)
            : 0;


        // ── Write all results back to MM row ──────────────────
        calcSetNum(mmRow, MM_COL.PRICE_PER_PAIL,    pricePerPail);
        calcSetStr(mmRow, MM_COL.ITEM_COVERAGE,     calcFmtDisplay(itemCoverage, matUnit));
        calcSetNum(mmRow, MM_COL.MAT_PRICE_UNIT,    matPricePerUnit);
        calcSetNum(mmRow, MM_COL.KEG_NEEDED,        pailNeeded);
        calcSetStr(mmRow, MM_COL.MAT_QUANTITY,      calcFmtDisplay(matQuantity, matUnit));
        calcSetNum(mmRow, MM_COL.MAT_COST,          matCost);
        calcSetNum(mmRow, MM_COL.SOLVENT_NEEDED,    solventNeeded);
        calcSetNum(mmRow, MM_COL.SOLVENT_QTY,       solventQty);
        calcSetNum(mmRow, MM_COL.SOLVENT_COST,      solventCost);
        calcSetStr(mmRow, MM_COL.MAT_LINE_COST,     matLineCost.toFixed(2));
        calcSetStr(mmRow, MM_COL.RS_PER_UNIT,       rsPerUnit.toFixed(2));
        calcSetNum(mmRow, MM_COL.MANDAYS_FORECAST,  mandaysForecast);
        calcSetStr(mmRow, MM_COL.TOTAL_MANDAY_COST, totalMandayCost.toFixed(2));
        calcSetNum(mmRow, MM_COL.REVERSE_RATE,      reverseRate);


        // ── Accumulate SCS-level totals ───────────────────────
        totalMatCost    += matCost;
        totalLabourCost += totalMandayCost;
        totalM2         += totalArea;
        totalMandays    += mandaysForecast;
        if (!isMisc) {
            totalMatCostExcl    += matCost;
            totalLabourCostExcl += totalMandayCost;
            totalM2Excl         += totalArea;
            totalMandaysExcl    += mandaysForecast;
        }
    });


    // ────────────────────────────────────────────────────────
    // STEP 3 — Write BOQ GP and BOQ Reverse Rate
    //          (needs MM totals per line — done after Step 2)
    // ────────────────────────────────────────────────────────
    boqRows.forEach(boqRow => {
        const boqLine = calcGetStr(boqRow, BOQ_COL.LINE);
        const amount  = calcGetNum(boqRow, BOQ_COL.AMOUNT);

        let lineCost    = 0;
        let lineRevRate = 0;

        mmRows.forEach(mmRow => {
            if (calcGetStr(mmRow, MM_COL.BOQ_LINE) !== boqLine) return;

            // Read the values we just wrote back in Step 2
            const mmMatLineCost    = parseFloat(
                mmRow.cells[MM_COL.MAT_LINE_COST]?.querySelector('input')?.value
            ) || 0;
            const mmTotalMandayCost = parseFloat(
                mmRow.cells[MM_COL.TOTAL_MANDAY_COST]?.querySelector('input')?.value
            ) || 0;

            lineCost    += mmMatLineCost + mmTotalMandayCost;
            lineRevRate += calcGetNum(mmRow, MM_COL.REVERSE_RATE);
        });

        calcSetNum(boqRow, BOQ_COL.GP,           amount - lineCost);
        calcSetNum(boqRow, BOQ_COL.REVERSE_RATE, lineRevRate);
    });


    // ────────────────────────────────────────────────────────
    // STEP 4 — Write SCS header fields
    //          Mirrors Deluge: Basic Info + Percentages + Other Info
    // ────────────────────────────────────────────────────────
    const setField = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.value = parseFloat((val || 0).toFixed(4));
    };

    const consbleCost     = (consumablesPct / 100) * totalContractSum;
    const consbleCostExcl = (consumablesPct / 100) * totalContractSumExcl;
    const grossProfit     = totalContractSum     - totalMatCost     - consbleCost     - totalLabourCost;
    const grossProfitExcl = totalContractSumExcl - totalMatCostExcl - consbleCostExcl - totalLabourCostExcl;

    // Basic Info
    setField('Contract_SumField',        totalContractSum);
    setField('Contract_SumField1',       totalContractSumExcl);
    setField('MaterialCostField',        totalMatCost);
    setField('MaterialCost1Field',       totalMatCostExcl);
    setField('ConsumbaleCostField',      consbleCost);
    setField('consumablesexclmiscField', consbleCostExcl);
    setField('LabourCostField',          totalLabourCost);
    setField('LabourCost1Field',         totalLabourCostExcl);
    setField('GrossProfitField',         grossProfit);
    setField('GrossProfit1Field',        grossProfitExcl);

    // Percentages
    setField('LabourSalesField',         totalContractSum     > 0 ? totalLabourCost     / totalContractSum     * 100 : 0);
    setField('LabourSalesFieldone',      totalContractSumExcl > 0 ? totalLabourCostExcl / totalContractSumExcl * 100 : 0);
    setField('MaterialSalesField',       totalContractSum     > 0 ? totalMatCost        / totalContractSum     * 100 : 0);
    setField('MaterialSalesFieldone',    totalContractSumExcl > 0 ? totalMatCostExcl    / totalContractSumExcl * 100 : 0);
    setField('ConsumableSalesField',     totalContractSum     > 0 ? consbleCost         / totalContractSum     * 100 : 0);
    setField('ConsumablesSalesFieldOne', totalContractSumExcl > 0 ? consbleCostExcl     / totalContractSumExcl * 100 : 0);
    setField('GPField',                  totalContractSum     > 0 ? grossProfit          / totalContractSum     * 100 : 0);
    setField('GPFieldone',               totalContractSumExcl > 0 ? grossProfitExcl      / totalContractSumExcl * 100 : 0);

    // Other Info
    setField('TotalM2Field',             totalM2);
    setField('TotalM2Fieldone',          totalM2Excl);
    setField('TotalMandaysField',        totalMandays);
    setField('TotalMandaysFieldone',     totalMandaysExcl);
    setField('RevenueMandayField',       totalMandays     > 0 ? totalContractSum     / totalMandays     : 0);
    setField('RevenueMandayFieldone',    totalMandaysExcl > 0 ? totalContractSumExcl / totalMandaysExcl : 0);
    setField('GPMandayField',            totalMandays     > 0 ? grossProfit           / totalMandays     : 0);
    setField('GPMandayFieldone',         totalMandaysExcl > 0 ? grossProfitExcl       / totalMandaysExcl : 0);
}


// ────────────────────────────────────────────────────────────
// EVENT BINDING
// Uses event delegation on #boqSubform tbody.
// Fires runSCSCalc() ONLY when the user types into the
// Quantity column (index 5 = BOQ_COL.QUANTITY).
// Works for all rows — static and dynamically added.
// ────────────────────────────────────────────────────────────
function bindBOQQuantityTrigger() {
    const boqTbody = document.querySelector('#boqSubform tbody');
    if (!boqTbody) {
        console.warn('[Calculations] #boqSubform tbody not found — trigger not bound.');
        return;
    }

    boqTbody.addEventListener('input', function (e) {
        const td = e.target.closest('td');
        if (!td) return;

        const row      = td.closest('tr');
        const colIndex = Array.from(row.cells).indexOf(td);

        // Fire ONLY on the Quantity column (col 5)
        if (colIndex === BOQ_COL.QUANTITY) {
            console.log('[Calculations] BOQ Quantity changed — running SCS Calc...');
            runSCSCalc();
        }
    });

    console.log('[Calculations] BOQ Quantity trigger bound successfully.');
}
