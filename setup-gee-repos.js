#!/usr/bin/env node
/**
 * @file setup-gee-repos.js
 * @description Node.js script to clone GEE repositories for BULC-D
 *
 * This provides a cross-platform alternative to the shell script.
 *
 * Usage:
 *   node setup-gee-repos.js [options]
 *   node setup-gee-repos.js --user alemlakes
 *   node setup-gee-repos.js --repos "r-2903-Dev,BULC-D,CommonCode"
 *   node setup-gee-repos.js --scan-only
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration
// ═══════════════════════════════════════════════════════════════════════════════

const config = {
  geeUsername: process.env.GEE_USERNAME || 'alemlakes',
  geeBaseUrl: 'https://earthengine.googlesource.com',
  scriptDir: __dirname,
  geeModulesDir: path.join(__dirname, 'gee_modules'),
  rawReposDir: path.join(__dirname, 'gee_repos_raw'),

  // Default repositories to clone
  // Format: { name: 'repo-name', target: 'folder-name' }
  defaultRepos: [
    { name: 'r-2903-Dev', target: 'r-2903-Dev' },
    { name: 'r-2909-BULC-Releases', target: 'r-2909-BULC-Releases' },
    { name: 'r-2902-Dev', target: 'r-2902-Dev' },
    { name: 'r-2901-BULC-Dev', target: 'r-2901-BULC-Dev' },
    { name: 'CommonCode', target: 'CommonCode' },
    { name: 'CommonCode2', target: 'CommonCode2' },
  ]
};

// ═══════════════════════════════════════════════════════════════════════════════
// Terminal Styling
// ═══════════════════════════════════════════════════════════════════════════════

const Style = {
  red:     (s) => `\x1b[31m${s}\x1b[0m`,
  green:   (s) => `\x1b[32m${s}\x1b[0m`,
  yellow:  (s) => `\x1b[33m${s}\x1b[0m`,
  blue:    (s) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s) => `\x1b[35m${s}\x1b[0m`,
  cyan:    (s) => `\x1b[36m${s}\x1b[0m`,
  bold:    (s) => `\x1b[1m${s}\x1b[0m`,
  dim:     (s) => `\x1b[2m${s}\x1b[0m`,

  success: (s) => `${Style.green('✓')} ${s}`,
  error:   (s) => `${Style.red('✗')} ${s}`,
  warning: (s) => `${Style.yellow('⚠')} ${s}`,
  info:    (s) => `${Style.cyan('ℹ')} ${s}`,
};

function banner(text) {
  const line = '═'.repeat(text.length + 4);
  console.log('\n' + Style.magenta(line));
  console.log(Style.magenta('║ ') + Style.bold(text) + Style.magenta(' ║'));
  console.log(Style.magenta(line) + '\n');
}

function section(text) {
  console.log('\n' + Style.blue('─'.repeat(60)));
  console.log(Style.blue('►') + ' ' + Style.bold(text));
  console.log(Style.blue('─'.repeat(60)));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Argument Parsing
// ═══════════════════════════════════════════════════════════════════════════════

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    user: config.geeUsername,
    repos: null,  // Will use defaults if null
    scanOnly: false,
    help: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--user':
      case '-u':
        options.user = args[++i];
        break;
      case '--repos':
      case '-r':
        options.repos = args[++i].split(',').map(r => r.trim());
        break;
      case '--scan-only':
        options.scanOnly = true;
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Git Operations
// ═══════════════════════════════════════════════════════════════════════════════

function checkGitInstalled() {
  try {
    execSync('git --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function checkGcloudAuth() {
  try {
    const result = execSync('gcloud auth list --filter=status:ACTIVE --format="value(account)"', {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return result.trim().split('\n').filter(a => a.includes('@'))[0] || null;
  } catch {
    return null;
  }
}

function configureGitCredentials() {
  section('Configuring Git Credentials');

  // Check if already configured
  try {
    execSync('git config --global --get credential.https://earthengine.googlesource.com.helper', { stdio: 'pipe' });
    console.log(Style.success('Git credential helper already configured'));
    return true;
  } catch {
    // Not configured, try to set up
  }

  // Try gcloud
  try {
    execSync('which gcloud', { stdio: 'pipe' });
    execSync('git config --global credential.https://earthengine.googlesource.com.helper gcloud.sh');
    console.log(Style.success('Configured gcloud as git credential helper'));
    return true;
  } catch {
    console.log(Style.warning('gcloud not available for credential helper'));
    console.log(Style.info('You may need to authenticate manually'));
    console.log('');
    console.log('  Options:');
    console.log('  1. Install Google Cloud SDK and run: gcloud auth login');
    console.log('  2. Use a .netrc file with credentials');
    console.log('  3. Configure SSH access to earthengine.googlesource.com');
    return false;
  }
}

function cloneRepo(repoName, targetFolder, username) {
  const repoUrl = `${config.geeBaseUrl}/users/${username}/${repoName}`;
  const clonePath = path.join(config.rawReposDir, repoName);
  const targetPath = path.join(config.geeModulesDir, targetFolder);

  console.log(Style.info(`Cloning: ${repoName} → ${targetFolder}`));

  // Create raw repos directory
  fs.mkdirSync(config.rawReposDir, { recursive: true });

  // Always clean target directory to ensure fresh state
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
  fs.mkdirSync(targetPath, { recursive: true });

  try {
    if (fs.existsSync(clonePath)) {
      // Reset and pull latest
      console.log(Style.dim(`  Pulling latest changes...`));
      execSync(`git -C "${clonePath}" fetch --all`, { stdio: 'pipe' });
      execSync(`git -C "${clonePath}" reset --hard origin/master`, { stdio: 'pipe' });
    } else {
      // Clone fresh
      execSync(`git clone "${repoUrl}" "${clonePath}"`, { stdio: 'pipe' });
    }

    // Copy GEE files to target (add .js extension if missing, strip print statements)
    const geeFiles = findGeeFiles(clonePath);
    let copiedCount = 0;

    for (const srcFile of geeFiles) {
      const relPath = path.relative(clonePath, srcFile);

      // Add .js extension if file doesn't end with .js
      let destPath = relPath;
      if (!relPath.endsWith('.js')) {
        destPath = relPath + '.js';
      }

      const destFile = path.join(targetPath, destPath);

      fs.mkdirSync(path.dirname(destFile), { recursive: true });

      // Copy file (print/Map statements handled by runner shims)
      fs.copyFileSync(srcFile, destFile);
      copiedCount++;
    }

    console.log(Style.success(`Cloned: ${repoName} (${copiedCount} files)`));
    return { success: true, files: copiedCount };

  } catch (err) {
    console.log(Style.error(`Failed to clone ${repoName}`));
    console.log(Style.dim(`  URL: ${repoUrl}`));
    console.log(Style.dim(`  Error: ${err.message}`));
    return { success: false, error: err.message };
  }
}

function findJsFiles(dir) {
  const files = [];

  function scan(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
          scan(fullPath);
        } else if (entry.isFile()) {
          // Include .js files OR files without extension (GEE style)
          if (entry.name.endsWith('.js') || !entry.name.includes('.')) {
            files.push(fullPath);
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  scan(dir);
  return files;
}

/**
 * No longer stripping print/Map statements - they're handled by dummy functions in the runner
 */

/**
 * Find all GEE code files (with or without .js extension)
 */
function findGeeFiles(dir) {
  const files = [];

  function scan(currentDir) {
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory() && entry.name !== '.git' && entry.name !== 'node_modules') {
          scan(fullPath);
        } else if (entry.isFile()) {
          // Check if it's a text file (GEE code)
          try {
            const content = fs.readFileSync(fullPath, 'utf8');
            // Simple heuristic: if it starts with common JS patterns or contains require()
            if (content.includes('var ') || content.includes('function ') ||
                content.includes('require(') || content.includes('exports.') ||
                content.includes('//') || content.includes('/*')) {
              files.push(fullPath);
            }
          } catch (e) {
            // Binary file or read error, skip
          }
        }
      }
    } catch (e) {
      // Ignore permission errors
    }
  }

  scan(dir);
  return files;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Dependency Scanning
// ═══════════════════════════════════════════════════════════════════════════════

function scanDependencies() {
  section('Scanning for Dependencies');

  if (!fs.existsSync(config.geeModulesDir)) {
    console.log(Style.warning('No gee_modules directory found'));
    return [];
  }

  const jsFiles = findJsFiles(config.geeModulesDir);
  const deps = new Set();
  const requireRegex = /require\s*\(\s*['"]users\/([^'"]+)['"]\s*\)/g;

  for (const file of jsFiles) {
    const content = fs.readFileSync(file, 'utf8');
    let match;

    while ((match = requireRegex.exec(content)) !== null) {
      deps.add('users/' + match[1]);
    }
  }

  const depList = Array.from(deps).sort();

  if (depList.length > 0) {
    console.log(Style.cyan('\nFound dependencies:'));

    for (const dep of depList) {
      // Extract repo name from path like "users/username/repo:file"
      const parts = dep.split('/');
      const repoWithFile = parts[2] || '';
      const repoName = repoWithFile.split(':')[0];

      // Check if we have this repo
      const hasRepo = fs.existsSync(path.join(config.geeModulesDir, repoName));

      if (hasRepo) {
        console.log(`  ${Style.green('✓')} ${dep}`);
      } else {
        console.log(`  ${Style.yellow('⚠')} ${dep} ${Style.yellow('(MISSING)')}`);
      }
    }
  } else {
    console.log(Style.info('No require() dependencies found'));
  }

  return depList;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Module Map Generation
// ═══════════════════════════════════════════════════════════════════════════════

function generateModuleMap(username) {
  section('Generating Module Map');

  const mapFile = path.join(config.scriptDir, 'module-map.json');
  const map = {
    _comment: 'Maps GEE require paths to local files',
    _generated: new Date().toISOString(),
    username: username,
    modules: {}
  };

  if (fs.existsSync(config.geeModulesDir)) {
    const jsFiles = findJsFiles(config.geeModulesDir);

    for (const file of jsFiles) {
      const relPath = path.relative(config.geeModulesDir, file);
      const parts = relPath.split(path.sep);
      const folderName = parts[0];
      const filePath = parts.slice(1).join('/').replace('.js', '');

      const geePath = `users/${username}/${folderName}:${filePath}`;
      map.modules[geePath] = relPath;
    }
  }

  fs.writeFileSync(mapFile, JSON.stringify(map, null, 2));
  console.log(Style.success(`Generated: ${mapFile}`));
  console.log(Style.info(`  ${Object.keys(map.modules).length} modules mapped`));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Caller Script Management
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Copy/update caller scripts from gee_modules to scripts_to_run
 * Only copies from r-2903-Dev/BULC/BULCD/BULCD-Callers/BULCD-Caller/
 */
function updateCallerScripts() {
  const scriptsDir = path.join(config.scriptDir, 'scripts_to_run');
  const callerSourceDir = path.join(config.geeModulesDir, 'r-2903-Dev/BULC/BULCD/BULCD-Callers/BULCD-Caller');
  
  // Ensure scripts_to_run directory exists
  fs.mkdirSync(scriptsDir, { recursive: true });
  
  if (!fs.existsSync(callerSourceDir)) {
    console.log(Style.warning(`Caller source not found: ${callerSourceDir}`));
    return;
  }
  
  let copiedCount = 0;
  
  // Copy all BULCD-Caller-*.js files from the source directory
  const entries = fs.readdirSync(callerSourceDir, { withFileTypes: true });
  
  for (const entry of entries) {
    if (entry.isFile() && entry.name.startsWith('BULCD-Caller-') && entry.name.endsWith('.js')) {
      const srcPath = path.join(callerSourceDir, entry.name);
      const destPath = path.join(scriptsDir, entry.name);
      
      fs.copyFileSync(srcPath, destPath);
      console.log(Style.success(`Updated: scripts_to_run/${entry.name}`));
      copiedCount++;
    }
  }
  
  if (copiedCount === 0) {
    console.log(Style.warning('No BULCD-Caller scripts found'));
  } else {
    console.log(Style.info(`Updated ${copiedCount} caller script(s)`));
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  const options = parseArgs();

  if (options.help) {
    console.log(`
${Style.bold(Style.magenta('BULC-D GEE Repository Setup'))}

${Style.bold('Usage:')}
  node setup-gee-repos.js [options]

${Style.bold('Options:')}
  -u, --user USERNAME    GEE username (default: ${config.geeUsername})
  -r, --repos LIST       Comma-separated list of repos to clone
  --scan-only            Only scan for dependencies, don't clone
  -v, --verbose          Enable verbose output
  -h, --help             Show this help

${Style.bold('Examples:')}
  ${Style.dim('# Clone default repos for alemlakes')}
  node setup-gee-repos.js

  ${Style.dim('# Clone for a different user')}
  node setup-gee-repos.js --user myusername

  ${Style.dim('# Clone specific repos')}
  node setup-gee-repos.js --repos "r-2903-Dev,CommonCode,BULC-Releases"

  ${Style.dim('# Just scan existing repos for dependencies')}
  node setup-gee-repos.js --scan-only

${Style.bold('Authentication:')}
  You need to authenticate with earthengine.googlesource.com:
  1. Install Google Cloud SDK
  2. Run: gcloud auth login
  3. The script will configure git to use gcloud credentials
`);
    process.exit(0);
  }

  config.geeUsername = options.user;

  banner('BULC-D GEE Repository Setup');

  console.log(Style.info(`GEE Username: ${config.geeUsername}`));
  console.log(Style.info(`Script directory: ${config.scriptDir}`));

  // Check prerequisites
  section('Checking Prerequisites');

  if (!checkGitInstalled()) {
    console.log(Style.error('Git is not installed'));
    process.exit(1);
  }
  console.log(Style.success('Git is installed'));

  const gcloudAccount = checkGcloudAuth();
  if (gcloudAccount) {
    console.log(Style.success(`gcloud authenticated: ${gcloudAccount}`));
  } else {
    console.log(Style.warning('gcloud not authenticated. Run: gcloud auth login'));
  }

  // Scan only mode
  if (options.scanOnly) {
    scanDependencies();
    process.exit(0);
  }

  // Configure credentials
  configureGitCredentials();

  // Determine repos to clone
  let repos;
  if (options.repos) {
    repos = options.repos.map(r => ({ name: r, target: r }));
  } else {
    repos = config.defaultRepos;
  }

  // Clone repos
  section('Cloning Repositories');

  console.log(Style.info(`Cloning ${repos.length} repositories...`));
  console.log('');

  const results = [];
  for (const repo of repos) {
    const result = cloneRepo(repo.name, repo.target, config.geeUsername);
    results.push({ ...repo, ...result });
    console.log('');
  }

  // Scan dependencies
  scanDependencies();

  // Generate module map
  generateModuleMap(config.geeUsername);

  // Copy caller scripts to scripts_to_run/
  section('Updating Caller Scripts');
  updateCallerScripts();

  // Summary
  section('Summary');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log('');
  console.log(`Total: ${results.length} | ${Style.green(`Success: ${successful}`)} | ${Style.red(`Failed: ${failed}`)}`);
  console.log('');

  for (const r of results) {
    if (r.success) {
      console.log(Style.success(`${r.name} → gee_modules/${r.target}/ (${r.files} files)`));
    } else {
      console.log(Style.error(`${r.name}: ${r.error}`));
    }
  }

  console.log('');
  console.log(Style.info('Next steps:'));
  console.log('  1. Add your service-account-key.json');
  console.log('  2. Run: npm test');
  console.log('  3. Run: node runner11.js --help');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(Style.error(`Fatal error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
