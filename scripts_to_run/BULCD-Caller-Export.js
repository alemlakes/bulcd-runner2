/*
BULCD-Caller-Export.js - Minimal export version
Exports a single multi-band image with bands controlled by exportParameters.includeBands flags
*/

var theVersion = "V52-Export"

// =======================================================================================================
// Requires
// =======================================================================================================

var afn_BULCD = require('users/alemlakes/r-2903-Dev:BULC/BULCD/BULCD-Code/BULCD-Module/6002.B2-BULCD-Module').afn_BULCD;
var afn_organizeBULCD_Inputs = require('users/alemlakes/r-2903-Dev:BULC/BULCD/BULCD-Code/BULCD-Module/6002.A2b.3-BULCD-Module-organizeBULCD_Inputs').afn_organizeBULCD_Inputs;
var advancedParameters = require('users/alemlakes/r-2909-BULC-Releases:BULC/BULC-Callers-Current/BULCD-Caller-Parameters/BULCD-AdvancedParameters-v5').advancedParameters;
var inputParameters = require('users/alemlakes/r-2909-BULC-Releases:BULC/BULC-Callers-Current/BULCD-Caller-Parameters/BULCD-InputParameters-v5').inputParameters;
var analysisParameters = require('users/alemlakes/r-2909-BULC-Releases:BULC/BULC-Callers-Current/BULCD-Caller-Parameters/BULCD-AnalysisParameters-v5').analysisParameters;
var exportParameters = require('users/alemlakes/r-2909-BULC-Releases:BULC/BULC-Callers-Current/BULCD-Caller-Parameters/BULCD-ExportParameters').exportParameters;
var interpretResults = require('users/alemlakes/r-2902-Dev:BULC/BULCD/BULCD-Code/BULCD-Module/6002.C2-BULCD-Module-analyzeOutputs').afn_interpretBULCDResult;
var afn_waterMask = require('users/alemlakes/CommonCode:513.waterMask/513-waterMask').afn_waterMask;

// =======================================================================================================
// Export Parameters
// =======================================================================================================

var bands = exportParameters.includeBands || {};

// =======================================================================================================
// Step 1. Run BULCD
// =======================================================================================================

var bulcD_input = afn_organizeBULCD_Inputs(inputParameters);

var bulcdParams = {
    defaultStudyArea: inputParameters.defaultStudyArea,
    theTargetYear: inputParameters.theTargetYear,
    binCuts: inputParameters.binCuts,
    targetLOFAsZScore: bulcD_input.targetLOFAsZScore,
    modalityDictionary: inputParameters.modalityDictionary,
    BULCargumentDictionaryPlus: advancedParameters()
};

var bulcD = afn_BULCD(bulcdParams);
var theWaterMask = afn_waterMask().not();
var finalBulcProbs = ee.Image(bulcD.finalBULCprobs).updateMask(theWaterMask);

var expectationPeriodSummaryValue = ee.Image(bulcD_input.expectationPeriodSummaryValue);
var expectationPeriodSD = ee.Image(bulcD_input.expectationPeriodSD);
var targetPeriodSummaryValue = ee.Image(bulcD_input.targetPeriodSummaryValue);

// =======================================================================================================
// Step 2. Post-run Analysis
// =======================================================================================================

var bulcD_output = interpretResults({
    changeThreshold: analysisParameters.changeThreshold,
    expPeriodMeanThreshold: analysisParameters.expPeriodMeanThreshold,
    targetPeriodMeanThreshold: analysisParameters.targetPeriodMeanThreshold,
    dropThresholdToDenoteChange: analysisParameters.dropThresholdToDenoteChange,
    gainThresholdToDenoteChange: analysisParameters.gainThresholdToDenoteChange,
    defaultStudyArea: inputParameters.defaultStudyArea,
    expectationPeriodSummaryValue: bulcD_input.expectationPeriodSummaryValue,
    expectationPeriodSD: bulcD_input.expectationPeriodSD,
    targetPeriodSummaryValue: bulcD_input.targetPeriodSummaryValue,
    theTargetYear: inputParameters.theTargetYear,
    endingChangeThreshold: analysisParameters.changeProbability,
    maxExportPixels: analysisParameters.maxExportPixels,
    theFinalBULCprobs: bulcD.finalBULCprobs,
    binCuts: inputParameters.binCuts,
    whichReduction: inputParameters.whichReduction,
    probabilityStackThroughTime: bulcD.allProbabilityLayers,
    wasItEverType: analysisParameters.wasItEverType || 'down',
    wasItEverComparison: analysisParameters.wasItEverComparison || 'gt',
    wasItEverValue: analysisParameters.wasItEverValue || 0.3,
    timing: {
        threshhold: analysisParameters.timingThreshhold || 0.3,
        changeLayer: ee.Image(1),
        dayStepSize: inputParameters.expectationCollectionParameters.dayStepSize,
        targetFirstDOY: inputParameters.trgfDOY || 1
    },
    waterMask: theWaterMask
});

// =======================================================================================================
// Step 3. Build Export Image
// =======================================================================================================

var exportImage = ee.Image([]);

if (bands.finalBULCProbs && bands.finalBULCProbs.enabled) {
    exportImage = exportImage
        .addBands(finalBulcProbs.select([0], ['prob_decrease']))
        .addBands(finalBulcProbs.select([1], ['prob_unchanged']))
        .addBands(finalBulcProbs.select([2], ['prob_increase']));
}

if (bands.probabilityDecrease && bands.probabilityDecrease.enabled) {
    exportImage = exportImage.addBands(finalBulcProbs.select([0], ['probability_decrease']));
}

if (bands.probabilityUnchanged && bands.probabilityUnchanged.enabled) {
    exportImage = exportImage.addBands(finalBulcProbs.select([1], ['probability_unchanged']));
}

if (bands.probabilityIncrease && bands.probabilityIncrease.enabled) {
    exportImage = exportImage.addBands(finalBulcProbs.select([2], ['probability_increase']));
}

if (bands.expectationSummaryValue && bands.expectationSummaryValue.enabled) {
    exportImage = exportImage.addBands(expectationPeriodSummaryValue.rename('expectation_summary').updateMask(theWaterMask));
}

if (bands.expectationStdDev && bands.expectationStdDev.enabled) {
    exportImage = exportImage.addBands(expectationPeriodSD.rename('expectation_stddev').updateMask(theWaterMask));
}

if (bands.expectationR2 && bands.expectationR2.enabled && bulcD_input.theExpectationR2) {
    exportImage = exportImage.addBands(ee.Image(bulcD_input.theExpectationR2).rename('expectation_r2').updateMask(theWaterMask));
}

if (bands.expectationResiduals && bands.expectationResiduals.enabled && bulcD_input.theExpectationResiduals) {
    exportImage = exportImage.addBands(ee.Image(bulcD_input.theExpectationResiduals).rename('expectation_residuals').updateMask(theWaterMask));
}

if (bands.targetSummaryValue && bands.targetSummaryValue.enabled) {
    exportImage = exportImage.addBands(targetPeriodSummaryValue.rename('target_summary').updateMask(theWaterMask));
}

if (bands.dropProbability && bands.dropProbability.enabled && bulcD_output.drop) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.drop).rename('drop_probability').updateMask(theWaterMask));
}

if (bands.gainProbability && bands.gainProbability.enabled && bulcD_output.up) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.up).rename('gain_probability').updateMask(theWaterMask));
}

if (bands.largeDropOrange && bands.largeDropOrange.enabled && bulcD_output.largeDropOrange) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.largeDropOrange).rename('large_drop_orange').updateMask(theWaterMask));
}

if (bands.threeColorChange && bands.threeColorChange.enabled && bulcD_output.drop && bulcD_output.largeDropOrange && bulcD_output.up) {
    var threeColor = ee.Image(bulcD_output.drop).unmask()
        .where(ee.Image(bulcD_output.drop).eq(1), 1)
        .where(ee.Image(bulcD_output.largeDropOrange).eq(1), 2)
        .where(ee.Image(bulcD_output.up).eq(1), 3)
        .selfMask();
    exportImage = exportImage.addBands(threeColor.rename('three_color_change'));
}

if (bands.wasItEver && bands.wasItEver.enabled && bulcD_output.wasItEver) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.wasItEver).rename('was_it_ever').selfMask());
}

if (bands.howOftenWasIt && bands.howOftenWasIt.enabled && bulcD_output.howOftenWasIt) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.howOftenWasIt).rename('how_often_was_it').selfMask());
}

if (bands.orangeChangeDOY && bands.orangeChangeDOY.enabled && bulcD_output.timing && bulcD_output.timing.orangeDateDOY) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.timing.orangeDateDOY).rename('orange_change_doy'));
}

if (bands.pinkChangeDOY && bands.pinkChangeDOY.enabled && bulcD_output.timing && bulcD_output.timing.pinkDateDOY) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.timing.pinkDateDOY).rename('pink_change_doy'));
}

if (bands.orangeStepDating && bands.orangeStepDating.enabled && bulcD_output.timing && bulcD_output.timing.orangeStepDating) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.timing.orangeStepDating).rename('orange_step_dating'));
}

if (bands.pinkStepDating && bands.pinkStepDating.enabled && bulcD_output.timing && bulcD_output.timing.pinkStepDating) {
    exportImage = exportImage.addBands(ee.Image(bulcD_output.timing.pinkStepDating).rename('pink_step_dating'));
}

// =======================================================================================================
// Step 4. Export
// =======================================================================================================

if (exportParameters.enabled !== false) {
    var assetId = (exportParameters.assetId || 'projects/api-project-269347469410/assets/BULCD_Result') + '_' + theVersion + '_' + inputParameters.theTargetYear;
    var description = (exportParameters.description || 'BULCD_Export') + '_' + theVersion + '_' + inputParameters.theTargetYear;
    
    Export.image.toAsset({
        image: exportImage.toFloat(),
        description: description,
        assetId: assetId,
        region: inputParameters.defaultStudyArea,
        scale: exportParameters.scale || 30,
        maxPixels: exportParameters.maxPixels || 1e13
    });
}

exports.bulcD_input = bulcD_input;
exports.bulcD = bulcD;
exports.bulcD_output = bulcD_output;
exports.exportImage = exportImage;
