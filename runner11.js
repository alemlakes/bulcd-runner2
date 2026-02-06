#!/usr/bin/env node
/**
 * @file runner11.js
 * @description Advanced Headless GEE Runner with Strict Validation, Batch Execution & Environment Injection
 * @version 11.0.0
 *
 * Features:
 * - Robust parameter validation with detailed error messages
 * - Color-coded terminal output for clear feedback
 * - Batch experiment execution support
 * - Dry-run mode for validation without execution
 * - Automatic study area geometry reconstruction
 * - Comprehensive logging to files
 * - Progress tracking for batch operations
 * - Graceful shutdown handling
 * - Module caching for performance
 */

const ee = require('@google/earthengine');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: TERMINAL STYLING & LOGGING
// ═══════════════════════════════════════════════════════════════════════════════

const Style = {
  // Colors
  red:     (s) => `\x1b[31m${s}\x1b[0m`,
  green:   (s) => `\x1b[32m${s}\x1b[0m`,
  yellow:  (s) => `\x1b[33m${s}\x1b[0m`,
  blue:    (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan:    (s) => `\x1b[36m${s}\x1b[0m`,
  white:   (s) => `\x1b[37m${s}\x1b[0m`,
  gray:    (s) => `\x1b[90m${s}\x1b[0m`,

  // Formatting
  bold:      (s) => `\x1b[1m${s}\x1b[0m`,
  dim:       (s) => `\x1b[2m${s}\x1b[0m`,
  underline: (s) => `\x1b[4m${s}\x1b[0m`,

  // Combined
  success: (s) => `\x1b[32m✓\x1b[0m ${s}`,
  error:   (s) => `\x1b[31m✗\x1b[0m ${s}`,
  warning: (s) => `\x1b[33m⚠\x1b[0m ${s}`,
  info:    (s) => `\x1b[36mℹ\x1b[0m ${s}`,
  rocket:  (s) => `🚀 ${s}`,
  lab:     (s) => `🧪 ${s}`,
  gear:    (s) => `⚙️  ${s}`,
  check:   (s) => `✅ ${s}`,
  time:    (s) => `⏱️  ${s}`,
};

class Logger {
  constructor(logDir = './logs') {
    this.logDir = logDir;
    this.logFile = null;
    this.startTime = Date.now();
    this.experimentId = null;
  }

  initLogFile(experimentName) {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.experimentId = `${experimentName}_${timestamp}`;
    this.logFile = path.join(this.logDir, `${this.experimentId}.log`);
    this.writeToFile(`\n${'═'.repeat(80)}\n`);
    this.writeToFile(`BULC-D Headless Lab Runner - Experiment Log\n`);
    this.writeToFile(`Experiment: ${experimentName}\n`);
    this.writeToFile(`Started: ${new Date().toISOString()}\n`);
    this.writeToFile(`${'═'.repeat(80)}\n\n`);
  }

  writeToFile(message) {
    if (this.logFile) {
      fs.appendFileSync(this.logFile, message);
    }
  }

  log(level, message, ...args) {
    const timestamp = new Date().toISOString();
    const plainMessage = `[${timestamp}] [${level.toUpperCase()}] ${message} ${args.join(' ')}`;
    this.writeToFile(plainMessage + '\n');

    let styledMessage;
    switch(level) {
      case 'success': styledMessage = Style.success(message); break;
      case 'error':   styledMessage = Style.error(message); break;
      case 'warning': styledMessage = Style.warning(message); break;
      case 'info':    styledMessage = Style.info(message); break;
      case 'gee':     styledMessage = Style.cyan('[GEE]') + ' ' + message; break;
      default:        styledMessage = message;
    }
    console.error(styledMessage, ...args);
  }

  success(message, ...args) { this.log('success', message, ...args); }
  error(message, ...args)   { this.log('error', message, ...args); }
  warning(message, ...args) { this.log('warning', message, ...args); }
  info(message, ...args)    { this.log('info', message, ...args); }
  gee(message, ...args)     { this.log('gee', message, ...args); }

  elapsed() {
    const ms = Date.now() - this.startTime;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  }

  banner(text) {
    const line = '═'.repeat(text.length + 4);
    console.error('\n' + Style.magenta(line));
    console.error(Style.magenta('║ ') + Style.bold(Style.white(text)) + Style.magenta(' ║'));
    console.error(Style.magenta(line) + '\n');
    this.writeToFile(`\n${line}\n║ ${text} ║\n${line}\n\n`);
  }

  section(text) {
    console.error('\n' + Style.blue('─'.repeat(60)));
    console.error(Style.blue('► ') + Style.bold(text));
    console.error(Style.blue('─'.repeat(60)));
    this.writeToFile(`\n${'─'.repeat(60)}\n► ${text}\n${'─'.repeat(60)}\n`);
  }

  table(data, title) {
    if (title) console.error('\n' + Style.bold(title));
    const maxKeyLen = Math.max(...Object.keys(data).map(k => k.length));
    Object.entries(data).forEach(([key, value]) => {
      const paddedKey = key.padEnd(maxKeyLen);
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value;
      console.error(`  ${Style.gray(paddedKey)} : ${Style.cyan(displayValue)}`);
    });
  }
}

const logger = new Logger('./logs');

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: CONFIGURATION & ARGUMENT PARSING
// ═══════════════════════════════════════════════════════════════════════════════

const HELP_TEXT = `
${Style.bold(Style.magenta('BULC-D Headless Lab Runner v11.0'))}

${Style.bold('Usage:')}
  node runner11.js <caller.js> <modules_dir> <sidecar.json> [options]

${Style.bold('Arguments:')}
  ${Style.cyan('caller.js')}      Path to the GEE Caller script to execute
  ${Style.cyan('modules_dir')}    Path to local GEE modules directory
  ${Style.cyan('sidecar.json')}   Path to experiment parameters JSON file

${Style.bold('Options:')}
  ${Style.yellow('--dry-run')}      Validate without executing (no GEE calls)
  ${Style.yellow('--verbose')}      Enable verbose output
  ${Style.yellow('--quiet')}        Suppress GEE print() output (recommended)
  ${Style.yellow('--silent')}       Suppress all non-error output
  ${Style.yellow('--no-log')}       Disable file logging
  ${Style.yellow('--batch')}        Enable batch mode (sidecar.json is a directory)
  ${Style.yellow('--parallel=N')}   Run N experiments in parallel (batch mode)
  ${Style.yellow('--help')}         Show this help message

${Style.bold('Examples:')}
  ${Style.dim('# Single experiment')}
  node runner11.js scripts_to_run/BULCD-Caller.js gee_modules experiments/test.json

  ${Style.dim('# Dry run (validation only)')}
  node runner11.js scripts_to_run/BULCD-Caller.js gee_modules experiments/test.json --dry-run

  ${Style.dim('# Batch execution')}
  node runner11.js scripts_to_run/BULCD-Caller.js gee_modules experiments/ --batch

${Style.bold('Environment:')}
  ${Style.cyan('GEE_KEY_PATH')}   Path to service account key (default: ./service-account-key.json)
`;

function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    userScript: null,
    moduleRoot: null,
    sidecarJson: null,
    dryRun: false,
    verbose: false,
    silent: false,
    noLog: false,
    batch: false,
    parallel: 1,
    help: false
  };

  const positional = [];

  for (const arg of args) {
    if (arg === '--help' || arg === '-h') config.help = true;
    else if (arg === '--dry-run') config.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') config.verbose = true;
    else if (arg === '--quiet' || arg === '-q') config.quiet = true;
    else if (arg === '--silent' || arg === '-s') config.silent = true;
    else if (arg === '--no-log') config.noLog = true;
    else if (arg === '--batch') config.batch = true;
    else if (arg.startsWith('--parallel=')) config.parallel = parseInt(arg.split('=')[1], 10) || 1;
    else positional.push(arg);
  }

  if (positional.length >= 1) config.userScript = positional[0];
  if (positional.length >= 2) config.moduleRoot = positional[1];
  if (positional.length >= 3) config.sidecarJson = positional[2];

  return config;
}

const config = parseArgs();

if (config.help) {
  console.error(HELP_TEXT);
  process.exit(0);
}

if (!config.userScript || !config.moduleRoot || !config.sidecarJson) {
  console.error(Style.error('Missing required arguments.\n'));
  console.error(HELP_TEXT);
  process.exit(1);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: PARAMETER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

const REQUIRED_KEYS = {
  inputParameters: [
    'whichReduction',
    'bandName_reduction',
    'bandNameToFit',
    'binCuts',
    'modalityDictionary'
  ],
  analysisParameters: [
    'changeThreshold',
    'dropThresholdToDenoteChange',
    'gainThresholdToDenoteChange'
  ],
  advancedParameters: [
    'initializationApproach',
    'transitionCreationMethod'
  ]
};

const MODALITY_KEYS = ['bimodal', 'constant', 'linear', 'trimodal', 'unimodal'];

function validateSidecar(data, filePath) {
  const errors = [];
  const warnings = [];

  // Check top-level structure
  for (const section of ['inputParameters', 'analysisParameters', 'advancedParameters']) {
    if (!data[section]) {
      errors.push(`Missing required section: ${section}`);
      continue;
    }

    // Check required keys in each section
    for (const key of REQUIRED_KEYS[section]) {
      if (data[section][key] === undefined) {
        errors.push(`Missing key in ${section}: ${key}`);
      }
    }
  }

  // Validate inputParameters specifics
  if (data.inputParameters) {
    const ip = data.inputParameters;

    // Validate binCuts
    if (ip.binCuts && !Array.isArray(ip.binCuts)) {
      errors.push('inputParameters.binCuts must be an array');
    }

    // Validate modalityDictionary
    if (ip.modalityDictionary) {
      for (const key of MODALITY_KEYS) {
        if (ip.modalityDictionary[key] === undefined) {
          warnings.push(`modalityDictionary missing key: ${key}`);
        }
      }

      // At least one modality should be true
      const hasModality = MODALITY_KEYS.some(k => ip.modalityDictionary[k] === true);
      if (!hasModality) {
        warnings.push('No modality is set to true in modalityDictionary');
      }
    }

    // Validate sensor dictionaries
    const sensors = ['L5dictionary', 'L7dictionary', 'L8dictionary', 'S2dictionary', 'S1dictionary'];
    for (const sensor of sensors) {
      if (ip[sensor]) {
        if (!ip[sensor].yearsList || !Array.isArray(ip[sensor].yearsList)) {
          warnings.push(`${sensor}.yearsList should be an array`);
        }
        if (ip[sensor].firstDOY === undefined) {
          warnings.push(`${sensor}.firstDOY not specified`);
        }
        if (ip[sensor].lastDOY === undefined) {
          warnings.push(`${sensor}.lastDOY not specified`);
        }
      }
    }
  }

  // Validate analysisParameters ranges
  if (data.analysisParameters) {
    const ap = data.analysisParameters;

    if (ap.changeThreshold !== undefined && (ap.changeThreshold < 0 || ap.changeThreshold > 1)) {
      warnings.push(`changeThreshold (${ap.changeThreshold}) is outside typical range [0, 1]`);
    }

    if (ap.dropThresholdToDenoteChange !== undefined &&
        ap.gainThresholdToDenoteChange !== undefined &&
        ap.dropThresholdToDenoteChange < ap.gainThresholdToDenoteChange) {
      warnings.push('dropThreshold < gainThreshold - this may produce unexpected results');
    }
  }

  return { errors, warnings, isValid: errors.length === 0 };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: MODULE RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

const moduleCache = new Map();

// Shared shims for print, Map, and ui - used by both main sandbox and modules
function createSharedShims() {
  // print shim - silent no-op (can be overridden in main sandbox for verbose mode)
  const print = (...args) => {
    // No-op by default in modules, main sandbox overrides for logging
  };
  
  // Comprehensive Map shim
  const Map = {
    addLayer: () => {},
    remove: () => {},
    layers: () => ({ 
      get: () => null, set: () => {}, length: () => 0, reset: () => {},
      forEach: () => {}, map: () => [], insert: () => {}, remove: () => {}
    }),
    centerObject: (obj, zoom, onComplete) => { if (onComplete) onComplete(); },
    setCenter: () => {},
    setZoom: () => {},
    getZoom: () => 10,
    getCenter: () => ({ lon: () => 0, lat: () => 0 }),
    getBounds: (asGeoJSON) => asGeoJSON 
      ? { type: 'Polygon', coordinates: [[[-180,-90],[-180,90],[180,90],[180,-90],[-180,-90]]] }
      : ee.Geometry.Rectangle([-180, -90, 180, 90]),
    getScale: () => 1000,
    setOptions: () => {},
    setControlVisibility: () => {},
    style: () => ({ set: () => ({}), get: () => ({}) }),
    setCursor: () => {},
    onClick: () => {},
    onChangeBounds: () => {},
    onChangeCenter: () => {},
    onChangeZoom: () => {},
    onIdle: () => {},
    onTileLoaded: () => {},
    unlisten: () => {},
    drawingTools: () => ({
      setShown: () => {}, setLinked: () => {}, setDrawModes: () => {}, setShape: () => {},
      draw: () => {}, edit: () => {}, stop: () => {}, clear: () => {}, get: () => null, set: () => {},
      getShown: () => false, onDraw: () => {}, onEdit: () => {}, onErase: () => {}, onSelect: () => {},
      layers: () => ({ get: () => [], set: () => {}, reset: () => {}, length: () => 0 }),
      toFeatureCollection: () => ee.FeatureCollection([])
    }),
    widgets: () => ({ get: () => null, set: () => {}, add: () => {}, remove: () => {}, reset: () => {}, length: () => 0 }),
    add: () => {},
    insert: () => {},
    clear: () => {}
  };
  
  // UI shims
  const ui = {
    Chart: {
      image: {
        series: () => ({ setOptions: () => ({ setChartType: () => {} }) }),
        byRegion: () => ({ setOptions: () => ({}) }),
        doySeries: () => ({ setOptions: () => ({}) }),
        doySeriesByYear: () => ({ setOptions: () => ({}) }),
        histogram: () => ({ setOptions: () => ({}) })
      },
      feature: {
        byFeature: () => ({ setOptions: () => ({}) }),
        byProperty: () => ({ setOptions: () => ({}) }),
        groups: () => ({ setOptions: () => ({}) }),
        histogram: () => ({ setOptions: () => ({}) })
      },
      array: {
        values: () => ({ setOptions: () => ({}) })
      }
    },
    Label: (text, style) => ({ style: () => ({ set: () => ({}) }), setValue: () => {} }),
    Panel: (widgets, layout, style) => ({ 
      add: () => ({}), insert: () => {}, remove: () => {}, clear: () => {},
      style: () => ({ set: () => ({}) }), 
      widgets: () => ({ get: () => [], set: () => {}, add: () => {}, reset: () => {} }),
      getLayout: () => ({})
    }),
    Button: (label, onClick, disabled, style) => ({ style: () => ({ set: () => ({}) }), setLabel: () => {}, onClick: () => {} }),
    Select: (items, placeholder, value, onChange, disabled, style) => ({ 
      style: () => ({ set: () => ({}) }), setValue: () => {}, getValue: () => null, setPlaceholder: () => {}
    }),
    Slider: (options) => ({ style: () => ({ set: () => ({}) }), setValue: () => {}, getValue: () => 0, onChange: () => {} }),
    Textbox: (options) => ({ style: () => ({ set: () => ({}) }), setValue: () => {}, getValue: () => '', onChange: () => {} }),
    Checkbox: (label, value, onChange, disabled, style) => ({ style: () => ({ set: () => ({}) }), setValue: () => {}, getValue: () => false }),
    DateSlider: (options) => ({ style: () => ({ set: () => ({}) }), setValue: () => {}, getValue: () => [] }),
    Thumbnail: (options) => ({ style: () => ({ set: () => ({}) }) }),
    Map: () => Map,
    SplitPanel: (first, second, orientation, wipe, style) => ({ style: () => ({ set: () => ({}) }) }),
    root: {
      clear: () => {},
      add: () => {},
      insert: () => {},
      remove: () => {},
      widgets: () => ({ get: () => [], set: () => {}, reset: () => {} }),
      setLayout: () => {},
      onResize: () => {}
    },
    url: {
      get: () => '',
      set: () => {}
    },
    data: {
      activeValue: (name, defaultValue) => defaultValue
    }
  };
  
  return { print, Map, ui };
}

function createModuleResolver(moduleRoot, sharedShims, sidecarData) {
  const ABS_MOD_ROOT = path.resolve(process.cwd(), moduleRoot);

  return function geeRequire(importPath) {
    // Handle native Node.js modules
    if (!importPath.startsWith('users/')) {
      return require(importPath);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PARAMETER INJECTION: Intercept parameter module requests
    // When the caller requires parameter modules, return the injected JSON instead
    // This allows the runner to work with unmodified caller scripts
    // ═══════════════════════════════════════════════════════════════════════════
    const lowerPath = importPath.toLowerCase();
    
    // Check for input parameters module
    if (lowerPath.includes('inputparameters') && sidecarData.inputParameters) {
      if (config.verbose) logger.info(`Parameter injection: inputParameters ← JSON sidecar`);
      return { inputParameters: sidecarData.inputParameters };
    }
    
    // Check for analysis parameters module
    if (lowerPath.includes('analysisparameters') && sidecarData.analysisParameters) {
      if (config.verbose) logger.info(`Parameter injection: analysisParameters ← JSON sidecar`);
      return { analysisParameters: sidecarData.analysisParameters };
    }
    
    // Note: We do NOT intercept advancedParameters - it's a complex function
    // that generates BULC configuration. Let it load from the GEE module file.
    // Only inputParameters and analysisParameters are overridden from JSON.

    // Check cache first
    if (moduleCache.has(importPath)) {
      if (config.verbose) logger.info(`Module cache hit: ${importPath}`);
      return moduleCache.get(importPath);
    }

    // Parse GEE-style path: users/username/repo:file
    const parts = importPath.split(':');
    const repoPath = parts[0];              // e.g., "users/alemlakes/BULC-D"
    const internalPath = parts[1] || '';     // e.g., "BULCD-Params" or ""

    // Extract repo name (last segment of the repo path)
    const repoName = repoPath.split('/').pop();

    // Build local file path
    let localPath = path.join(ABS_MOD_ROOT, repoName, internalPath);
    if (!localPath.endsWith('.js')) localPath += '.js';

    if (!fs.existsSync(localPath)) {
      const error = new Error(`Module not found: ${localPath}\n  ← Required from GEE path: ${importPath}`);
      error.code = 'MODULE_NOT_FOUND';
      throw error;
    }

    if (config.verbose) logger.info(`Loading module: ${localPath}`);

    // Create module sandbox with exports AND shared shims (print, Map, ui)
    const moduleExports = {};
    const moduleSandbox = {
      exports: moduleExports,
      module: { exports: moduleExports },
      require: geeRequire,
      ee: ee,
      console: console,
      __filename: localPath,
      __dirname: path.dirname(localPath),
      // Include shared shims so modules can use print, Map, ui
      print: sharedShims.print,
      Map: sharedShims.Map,
      ui: sharedShims.ui
    };

    try {
      const code = fs.readFileSync(localPath, 'utf8');
      vm.createContext(moduleSandbox);
      vm.runInContext(code, moduleSandbox);

      // Cache the result
      const result = moduleSandbox.module.exports || moduleSandbox.exports;
      moduleCache.set(importPath, result);

      return result;
    } catch (err) {
      throw new Error(`Failed to load module ${localPath}: ${err.message}`);
    }
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: GEOMETRY RECONSTRUCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Reconstructs GEE Geometry objects from JSON coordinates.
 * This handles the "defaultStudyArea" problem where JSON can't store ee.Geometry.
 */
function reconstructGeometries(params) {
  if (!params.inputParameters) return params;

  const ip = params.inputParameters;

  // Reconstruct defaultStudyArea if coordinates are provided
  if (ip.defaultStudyAreaCoordinates) {
    ip.defaultStudyArea = ee.Geometry.Polygon(
      ip.defaultStudyAreaCoordinates,
      null,
      ip.defaultStudyAreaGeodesic !== undefined ? ip.defaultStudyAreaGeodesic : false
    );
    logger.info('Reconstructed defaultStudyArea from coordinates');
  }

  // Propagate defaultStudyArea to nested collection parameters
  if (ip.defaultStudyArea) {
    if (ip.expectationCollectionParameters) {
      ip.expectationCollectionParameters.defaultStudyArea = ip.defaultStudyArea;
    }
    if (ip.targetCollectionParameters) {
      ip.targetCollectionParameters.defaultStudyArea = ip.defaultStudyArea;
    }
  }

  // Reconstruct AOI in sensor dictionaries (for s2cloudless)
  const collectionParams = ['expectationCollectionParameters', 'targetCollectionParameters'];
  for (const cp of collectionParams) {
    if (ip[cp]?.S2dictionary?.s2cloudless) {
      ip[cp].S2dictionary.s2cloudless.AOI = ip.defaultStudyArea;
    }
  }

  return params;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: SANDBOX CREATION
// ═══════════════════════════════════════════════════════════════════════════════

function createSandbox(sidecarData, moduleResolver, sharedShims) {
  // Submitted task tracking
  const submittedTasks = [];

  // Script exports container
  const scriptExports = {};

  const sandbox = {
    ee: ee,
    require: moduleResolver,

    // Provide exports for scripts that use them
    exports: scriptExports,
    module: { exports: scriptExports },

    // THE SWITCH: This triggers Lab Mode in the Caller
    inputParams: sidecarData,

    // GEE print shim - logs to console unless --quiet flag is set
    print: (...args) => {
      if (config.quiet) return; // Suppress print output in quiet mode
      const formatted = args.map(a =>
        typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)
      ).join(' ');
      logger.gee(formatted);
    },

    console: {
      log: (...args) => logger.info(...args),
      error: (...args) => logger.error(...args),
      warn: (...args) => logger.warning(...args),
      info: (...args) => logger.info(...args)
    },

    // Use shared Map and ui shims
    Map: sharedShims.Map,
    ui: sharedShims.ui,

    // Export handling - AUTO-START: tasks are submitted immediately
    // This mirrors GEE Code Editor behavior where clicking Run starts the task
    Export: {
      image: {
        toAsset: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export image to asset: ${config.assetId || config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.image.toAsset(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'image.toAsset', config });
          logger.info(`Export started: ${config.description || config.assetId}`);
          return { start: () => {} };  // No-op if .start() called again
        },
        toDrive: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export image to Drive: ${config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.image.toDrive(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'image.toDrive', config });
          logger.info(`Export started: ${config.description}`);
          return { start: () => {} };
        },
        toCloudStorage: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export image to Cloud Storage: ${config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.image.toCloudStorage(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'image.toCloudStorage', config });
          logger.info(`Export started: ${config.description}`);
          return { start: () => {} };
        }
      },
      table: {
        toAsset: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export table to asset: ${config.assetId || config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.table.toAsset(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'table.toAsset', config });
          logger.info(`Export started: ${config.description || config.assetId}`);
          return { start: () => {} };
        },
        toDrive: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export table to Drive: ${config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.table.toDrive(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'table.toDrive', config });
          logger.info(`Export started: ${config.description}`);
          return { start: () => {} };
        }
      },
      video: {
        toDrive: (config) => {
          if (module.exports.dryRun) {
            logger.info(`[DRY-RUN] Would export video to Drive: ${config.description}`);
            return { start: () => {} };
          }
          const task = ee.batch.Export.video.toDrive(config);
          task.start();  // Auto-start
          submittedTasks.push({ type: 'video.toDrive', config });
          logger.info(`Export started: ${config.description}`);
          return { start: () => {} };
        }
      }
    },

    // Provide access to submitted tasks
    __submittedTasks: submittedTasks
  };

  return sandbox;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: EXPERIMENT EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runExperiment(userScript, moduleRoot, sidecarPath) {
  const experimentName = path.basename(sidecarPath, '.json');

  if (!config.noLog) {
    logger.initLogFile(experimentName);
  }

  logger.banner('BULC-D HEADLESS LAB RUNNER v11.0');

  // --- Load and validate sidecar ---
  logger.section('Loading Experiment Configuration');

  let sidecarData;
  try {
    const raw = fs.readFileSync(path.resolve(sidecarPath), 'utf8');
    sidecarData = JSON.parse(raw);
    logger.success(`Loaded sidecar: ${path.basename(sidecarPath)}`);
  } catch (e) {
    logger.error(`Failed to parse JSON: ${e.message}`);
    return { success: false, error: e.message };
  }

  // Validate
  logger.section('Validating Parameters');
  const validation = validateSidecar(sidecarData, sidecarPath);

  if (validation.errors.length > 0) {
    logger.error('Validation failed with errors:');
    validation.errors.forEach(e => logger.error(`  • ${e}`));
    return { success: false, errors: validation.errors };
  }

  if (validation.warnings.length > 0) {
    logger.warning('Validation warnings:');
    validation.warnings.forEach(w => logger.warning(`  • ${w}`));
  }

  logger.success('Parameter validation passed');

  // Show configuration summary
  if (config.verbose) {
    logger.table({
      'Caller Script': userScript,
      'Module Root': moduleRoot,
      'Sidecar': sidecarPath,
      'Dry Run': config.dryRun,
      'Change Threshold': sidecarData.analysisParameters?.changeThreshold,
      'Initialization': sidecarData.advancedParameters?.initializationApproach
    }, 'Configuration Summary:');
  }

  // Check user script exists
  if (!fs.existsSync(userScript)) {
    logger.error(`Caller script not found: ${userScript}`);
    return { success: false, error: 'Caller script not found' };
  }

  // Dry run stops here
  if (config.dryRun) {
    logger.section('Dry Run Complete');
    logger.success('All validations passed. Ready for execution.');
    return { success: true, dryRun: true };
  }

  // --- Authenticate and Execute ---
  logger.section('Initializing Google Earth Engine');

  return new Promise((resolve) => {
    const keyPath = process.env.GEE_KEY_PATH || './service-account-key.json';

    if (!fs.existsSync(keyPath)) {
      logger.error(`Service account key not found: ${keyPath}`);
      logger.info('Set GEE_KEY_PATH environment variable or place key at ./service-account-key.json');
      resolve({ success: false, error: 'Service account key not found' });
      return;
    }

    const KEY = require(path.resolve(keyPath));
    logger.info(`Authenticating as: ${KEY.client_email}`);

    ee.data.authenticateViaPrivateKey(KEY, () => {
      logger.success('Authentication successful');

      ee.initialize(null, null, () => {
        logger.success('Earth Engine initialized');

        logger.section('Executing Experiment');

        try {
          // Reconstruct geometries
          sidecarData = reconstructGeometries(sidecarData);

          // Create shared shims for print, Map, ui (used by modules)
          const sharedShims = createSharedShims();
          
          // Create sandbox and resolver with shared shims and parameter injection
          const moduleResolver = createModuleResolver(moduleRoot, sharedShims, sidecarData);
          const sandbox = createSandbox(sidecarData, moduleResolver, sharedShims);

          // Read and execute caller script
          const code = fs.readFileSync(userScript, 'utf8');
          vm.createContext(sandbox);

          logger.info(`Executing: ${path.basename(userScript)}`);
          vm.runInContext(code, sandbox);

          // Report results
          logger.section('Execution Complete');

          const tasks = sandbox.__submittedTasks;
          if (tasks.length > 0) {
            logger.success(`Submitted ${tasks.length} task(s) to GEE:`);
            tasks.forEach((t, i) => {
              logger.info(`  ${i + 1}. ${t.type}: ${t.config.description || t.config.assetId || 'unnamed'}`);
            });
          } else {
            logger.warning('No export tasks were submitted');
          }

          logger.info(Style.time(`Total time: ${logger.elapsed()}`));

          resolve({ success: true, tasksSubmitted: tasks.length });

        } catch (err) {
          logger.error('Runtime error:');
          logger.error(err.stack);
          resolve({ success: false, error: err.message });
        }
      }, (err) => {
        logger.error(`Failed to initialize EE: ${err}`);
        resolve({ success: false, error: err });
      });
    }, (err) => {
      logger.error(`Authentication failed: ${err}`);
      resolve({ success: false, error: err });
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: BATCH EXECUTION
// ═══════════════════════════════════════════════════════════════════════════════

async function runBatch(userScript, moduleRoot, experimentsDir) {
  logger.banner('BATCH MODE ENABLED');

  // Find all JSON files in the experiments directory
  const files = fs.readdirSync(experimentsDir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(experimentsDir, f));

  if (files.length === 0) {
    logger.error(`No JSON files found in: ${experimentsDir}`);
    return;
  }

  logger.info(`Found ${files.length} experiment(s) to run`);
  files.forEach((f, i) => logger.info(`  ${i + 1}. ${path.basename(f)}`));

  const results = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    console.error('\n' + Style.yellow('═'.repeat(80)));
    logger.info(`Running experiment ${i + 1}/${files.length}: ${path.basename(file)}`);
    console.error(Style.yellow('═'.repeat(80)));

    const result = await runExperiment(userScript, moduleRoot, file);
    results.push({
      file: path.basename(file),
      ...result
    });

    // Clear module cache between experiments
    moduleCache.clear();
  }

  // Summary
  logger.banner('BATCH SUMMARY');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  logger.info(`Total: ${results.length} | ${Style.green(`Passed: ${successful}`)} | ${Style.red(`Failed: ${failed}`)}`);

  results.forEach(r => {
    if (r.success) {
      logger.success(`${r.file} - ${r.tasksSubmitted || 0} tasks`);
    } else {
      logger.error(`${r.file} - ${r.error || 'Unknown error'}`);
    }
  });

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

// Export for testing
module.exports = {
  dryRun: config.dryRun,
  runExperiment,
  runBatch,
  validateSidecar
};

// Graceful shutdown
process.on('SIGINT', () => {
  console.error('\n' + Style.warning('Interrupted. Shutting down...'));
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.error('\n' + Style.warning('Terminated. Shutting down...'));
  process.exit(143);
});

// Run if executed directly
if (require.main === module) {
  (async () => {
    try {
      if (config.batch) {
        await runBatch(config.userScript, config.moduleRoot, config.sidecarJson);
      } else {
        const result = await runExperiment(config.userScript, config.moduleRoot, config.sidecarJson);
        process.exit(result.success ? 0 : 1);
      }
    } catch (err) {
      logger.error(`Fatal error: ${err.message}`);
      logger.error(err.stack);
      process.exit(1);
    }
  })();
}
