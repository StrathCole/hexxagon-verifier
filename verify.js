const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const unzipper = require('unzipper');

const githubToken = process.env.GITHUB_TOKEN;
const repoOwner = 'classic-terra';
const workflowFileName = 'deploy.yml';
const baseURL = 'https://api.github.com';
const deployPath = `.github/workflows/${workflowFileName}`;
const storageKey = 'workflowFileHash';
const storageFilePath = '.storage.json';

const isBrowser = typeof window !== 'undefined';
const extensionUriChrome = 'https://clients2.google.com/service/update2/crx?response=redirect&os=linux&arch=x64&os_arch=x86_64&nacl_arch=x86-64&prod=chromium&prodchannel=unknown&prodversion=91.0.4442.4&lang=en-US&acceptformat=crx2,crx3&x=id%3Dakckefnapafjbpphkefbpkpcamkoaoai%26installsource%3Dondemand%26uc';
const extensionUriFirefox = null;

axios.defaults.headers.common['Authorization'] = `Bearer ${githubToken}`;

let resultsFile = process.argv[2];
if (!resultsFile) {
    resultsFile = path.join(process.cwd(), 'result.json');
} else {
    resultsFile = path.resolve(resultsFile);
}

let resultsDirectory = path.dirname(resultsFile);
if (!fs.existsSync(resultsDirectory)) {
    fs.mkdirSync(resultsDirectory, {recursive: true});
}

let result = {
    last_check: '',
    station: {
        status_ok: false,
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    },
    finder: {
        status_ok: false,
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    },
    extension_chrome: {
        status_ok: false,
        updating: false,
        published_version: '',
        deployed_version: '',
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    },
    extension_firefox: {
        status_ok: false,
        updating: false,
        published_version: '',
        deployed_version: '',
        latest_run_url: '',
        latest_commit_url: '',
        workflow_file: {
            changed: false,
            hash: '',
            prev_hash: ''
        },
        deployed_files: [],
    }
};


async function getPreviouslyStoredHash() {
    if (isBrowser) {
        return window.localStorage.getItem(storageKey);
    } else {
        if (!fs.existsSync(storageFilePath)) {
            fs.writeFileSync(storageFilePath, '{}');
        }

        try {
            const data = fs.readFileSync(storageFilePath, 'utf8');
            const json = JSON.parse(data);
            return json[storageKey];
        } catch (error) {
            console.error(`Error reading ${storageFilePath} file: ${error}`);
        }
    }
}

async function storeNewHash(hash) {
    if (isBrowser) {
        window.localStorage.setItem(storageKey, hash);
    } else {
        try {
            const json = { [storageKey]: hash };
            fs.writeFileSync('.storage.json', JSON.stringify(json));
        } catch (error) {
            console.error(`Error writing to .storage.json file: ${error}`);
        }
    }
}

async function fetchAndHashWorkflowFile(repoName) {
    try {
        const response = await axios.get(`https://raw.githubusercontent.com/${repoOwner}/${repoName}/master/${deployPath}`, { responseType: 'arraybuffer' });
        const fileHash = crypto.createHash('md5').update(response.data).digest('hex');
        console.log(`MD5 hash of the current workflow file: ${fileHash}`);
        
        const storedHash = await getPreviouslyStoredHash();

        if (fileHash === storedHash) {
            console.log(`Workflow file has not been changed.`);
        } else {
            console.log(`Workflow file has been changed.`);
            await storeNewHash(fileHash);
        }

        return fileHash;
    } catch (error) {
        console.error(`Error fetching and hashing workflow file: ${error}`);
    }
}

async function fetchAndHashWorkflowFileAtCommit(commitSHA, repoName) {
    try {
        const response = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/contents/${deployPath}?ref=${commitSHA}`);
        const fileContent = Buffer.from(response.data.content, 'base64');
        const fileHash = crypto.createHash('md5').update(fileContent).digest('hex');
        return fileHash;
    } catch (error) {
        console.error(`Error fetching and hashing workflow file at commit ${commitSHA}: ${error}`);
    }
}

async function fetchManifestFileAtCommit(commitSHA, repoName, type) {
    const manifestName = (type === 'chrome' ? 'chrome.manifest.json' : 'firefox.manifest.json');
    const manifestUrl = `${baseURL}/repos/${repoOwner}/${repoName}/contents/public/${manifestName}?ref=${commitSHA}`;
    
    try {
        const response = await axios.get(manifestUrl);
        const fileContent = Buffer.from(response.data.content, 'base64');

        return JSON.parse(fileContent.toString());
    } catch (error) {
        console.error(`Error fetching manifest file at commit ${commitSHA} - ${manifestUrl}: ${error}`);
    }
}

async function fetchLatestWorkflowRun(repoName, type, get_runs) {
    if(!get_runs) {
        get_runs = 1;
    }
    try {
        const workflows = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/actions/workflows`);
        const workflow = workflows.data.workflows.find(w => w.path.includes(workflowFileName));
        const runs = await axios.get(`${baseURL}/repos/${repoOwner}/${repoName}/actions/workflows/${workflow.id}/runs`);
        
        const run_data = [];

        for(let i = 0; i < runs.data.workflow_runs.length && i < get_runs; i++) {
            const latestRun = runs.data.workflow_runs[i];

            const runCommitHash = await fetchAndHashWorkflowFileAtCommit(latestRun.head_sha, repoName);
            const currentCommitHash = await fetchAndHashWorkflowFile(repoName);
            if(repoName === "station-extension") {
                repoName = (type === 'chrome' ? "extension_chrome" : "extension_firefox");
            }

            run_data.push({
                run: latestRun,
                runCommitHash,
                currentCommitHash,
                lines: []
            });
        }
        return run_data;
    } catch (error) {
        console.error(`Error fetching workflow run: ${error}`);
    }
}

async function downloadAndUnzipArtifact(runs, fileName) {
    try {
        const runResults = [];

        for(let i = 0; i < runs.length; i++) {
            const run = runs[i];

            console.log(`Fetching artifacts for run ${run.run.html_url}`)

            const artifacts = await axios.get(run.run.artifacts_url);
            let artifact = undefined;
            for (let a of artifacts.data.artifacts) {
                if (a.name === fileName) {
                    artifact = a;
                    break;
                }
            }
            if(!artifact) {
                console.error(`Error downloading artifact: no artifact found with name ${fileName}`);
                return;
            }

            //console.log(`Downloading artifact ${artifact.name} from ${artifact.archive_download_url}`);

            const download = await axios.get(artifact.archive_download_url, { responseType: 'stream' });

            const artifactPath = `./${artifact.name}.zip`;
            const writer = fs.createWriteStream(artifactPath);
            
            const lines = await new Promise((resolve, reject) => {
                download.data.pipe(writer)
                    .on('finish', () => {
                        fs.createReadStream(artifactPath)
                            .pipe(unzipper.Parse())
                            .on('entry', async function (entry) {
                                if (entry.type === 'File') {
                                    const content = await entry.buffer();
                                    resolve(content.toString().split('\n'));
                                } else {
                                    entry.autodrain();
                                }
                            });
                    })
                    .on('error', reject);
            });

            run['lines'] = lines;
            runResults.push(run);
        }

        return runResults;
    } catch (error) {
        console.error(`Error downloading artifact: ${error}`);
    }
}

function extractZipFromCrx3(buff) {
    if (buff.readUInt32LE(0) !== 0x34327243 /* Cr24 */) {
        console.log('Unexpected CRX magic number');
        return undefined;
    }

    var crxVersion = buff.readUInt32LE(4);
    if (crxVersion !== 2 && crxVersion !== 3) {
        console.log('Unexpected CRX version number');
        return undefined;
    }

    if (crxVersion === 2) {
        var publicKeyLength = buff.readUInt32LE(8);
        var signatureLength = buff.readUInt32LE(12);
        var metaOffset = 16;
        var publicKey = Buffer.from(buff.slice(metaOffset,
            metaOffset + publicKeyLength)).toString('base64');
        var signature = Buffer.from(buff.slice(metaOffset + publicKeyLength,
            metaOffset + publicKeyLength + signatureLength)).toString('base64');
        
        return {
            header: {
            publicKey: publicKey,
            signature: signature
            },
            body: buff.slice(metaOffset + publicKeyLength + signatureLength)
        };
    } else if (crxVersion === 3) {
        var headerLength = buff.readUInt32LE(8);
        var metaOffset = 12;
        // var rawHeader = Buffer.from(buff.slice(metaOffset,
        //   metaOffset + headerLength));
        
        return {
            header: null,
            body: buff.slice(metaOffset + headerLength)
        };
    }    
}
 
function createCheckObject(deployed, published) {
    if (Array.isArray(deployed) && Array.isArray(published)) {
      return deployed.map((item, index) => {
        if (typeof item === 'object' && typeof published[index] === 'object') {
          return createCheckObject(item, published[index]);
        } else {
          return published[index] !== undefined ? published[index] : null;
        }
      });
    }
  
    let checked = {};
  
    for (let key in deployed) {
      if (published.hasOwnProperty(key)) {
        if (typeof deployed[key] === 'object' && typeof published[key] === 'object') {
          checked[key] = createCheckObject(deployed[key], published[key]);
        } else {
          checked[key] = published[key];
        }
      } else {
        checked[key] = null;
      }
    }
  
    return checked;
  }
  
  

async function verifyExtensionHashes(runs, type) {
    try {
        const repoName = 'extension_'+type;
        const downloadUrl = (type === 'chrome' ? extensionUriChrome : extensionUriFirefox);
        if(!downloadUrl) {
            console.error(`Error verifying extension hashes: no download url`);
            return;
        }

        const response = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        if(!response.data) {
            console.error(`Error verifying extension hashes: no response data`);
            return;
        }
        const buff = Buffer.from(response.data);
        const data = (type === 'chrome' ? extractZipFromCrx3(buff) : { body: buff });
        if(!data) {
            console.error(`Error verifying extension hashes: no extracted data`);
            return;
        }
        const zipContents = await unzipper.Open.buffer(data.body);
        let published_manifest = undefined;
        for (let file of zipContents.files) {
            if (file.type === 'File') {
                if(file.path === 'manifest.json') {
                    const contents = await file.buffer();
                    published_manifest = JSON.parse(contents.toString());
                    break;
                }
            }
        }
        if(!published_manifest) {
            console.error(`Error verifying extension hashes: no published manifest found`);
            result['extension_'+type].deployed_files.push({
                file: 'manifest.json',
                hash: '',
                deployed_hash: '',
                ok: false
            });
            return;
        }

        for (let run of runs) {
            // fetch manifest file at commit
            const deployed_manifest = await fetchManifestFileAtCommit(run.run.head_sha, 'station-extension', type);
            if(!deployed_manifest) {
                console.log(`no deployed manifest found in run ${run.run.html_url}`);
                continue;
            }

            result[repoName].workflow_file.hash = run.currentCommitHash;
            result[repoName].workflow_file.prev_hash = run.runCommitHash;
            result.last_check = Math.floor(new Date().getTime() / 1000);
            result[repoName].latest_run_url = run.run.html_url;
            result[repoName].latest_commit_url = run.run.head_commit.url;

            // compare manifest versions
            if(published_manifest.version !== deployed_manifest.version) {
                console.log(`manifest versions do not match: ${published_manifest.version} !== ${deployed_manifest.version}`);
                if (result['extension_'+type].updating === false) {
                    result['extension_'+type].updating = true;
                    result['extension_'+type].published_version = published_manifest.version;
                    result['extension_'+type].deployed_version = deployed_manifest.version;
                }
                continue;
            }
        
            if (run.runCommitHash === run.currentCommitHash) {
                console.log(`The workflow file has not been changed since the last run.`);
            } else {
                result[repoName].workflow_file.changed = true;
                console.log(`The workflow file has been changed since the last run: ${run.runCommitHash} !== ${run.currentCommitHash}`);
            }

            const lines = run.lines.filter((line) => line).map(line => {
                if(line) {
                    let [hash, url] = line.split('  ');
                    
                    return { hash, url };
                }
            });

            // Loop through each file in the zip
            const prefix = (type === 'chrome' ? 'chrome-extension://akckefnapafjbpphkefbpkpcamkoaoai/' : 'firefox/');
            for (let file of zipContents.files) {
                if (file.type === 'File') {
                    const contents = await file.buffer();
                    let publishedHash = crypto.createHash('md5').update(contents).digest('hex');
                    let originalHash = lines.find(line => line.url === prefix + file.path)?.hash;
                    
                    if(file.path === '_metadata/verified_contents.json') {
                        // these cannot be verified by hash as they are modified by the stores
                        continue;
                    } else if(file.path === 'manifest.json') {
                        // manifest cannot be verified by hash as it is modified by the stores
                        // we will create two objects from the deployed and published versions and compare the hash of those
                        // for that we will check all keys existing in deployed json and compare them to the published json, but ignore any keys that are not in the deployed json
                        publishedHash = crypto.createHash('md5').update(JSON.stringify(deployed_manifest)).digest('hex');
                        originalHash = crypto.createHash('md5').update(JSON.stringify(createCheckObject(deployed_manifest, published_manifest))).digest('hex');
                    }   
                    if(!originalHash) {
                        console.log(`no hash found for ${file.path}:]`, lines);
                        break;
                    }
                    
                    const isOk = (originalHash === publishedHash);

                    if (isOk) {
                        console.log(`Verifying ${file.path}: OK`);
                    } else {
                        console.log(`Verifying ${file.path}: MISMATCH`);
                    }
            
                    result['extension_'+type].deployed_files.push({
                        file: file.path,
                        hash: originalHash,
                        deployed_hash: publishedHash,
                        ok: isOk
                    });
                }
            }
            break;
        }
        return;
    } catch (error) {
        console.error(`Error verifying extension hashes: ${error}`);
    }
}


async function verifyHashes(runs, repoName) {
    const run = runs[0];
    if(!run) {
        console.error(`Error verifying hashes: no run found`);
        return;
    }
    const lines = run.lines;

    if (run.runCommitHash === run.currentCommitHash) {
        console.log(`The workflow file has not been changed since the last run.`);
    } else {
        result[repoName].workflow_file.changed = true;
        console.log(`The workflow file has been changed since the last run: ${run.runCommitHash} !== ${run.currentCommitHash}`);
    }
    result[repoName].workflow_file.hash = run.currentCommitHash;
    result[repoName].workflow_file.prev_hash = run.runCommitHash;
    result.last_check = Math.floor(new Date().getTime() / 1000);
    result[repoName].latest_run_url = run.run.html_url;
    result[repoName].latest_commit_url = run.run.head_commit.url;

    for (let line of lines) {
        if (line) {
            let [hash, url] = line.split('  ');
            await verifyHash(hash, url, repoName);
        }
    }
}

async function verifyHash(hash, url, repoName) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const fileHash = crypto.createHash('md5').update(response.data).digest('hex');
        const isOk = fileHash === hash;

        if (isOk) {
            console.log(`Verifying ${url}: OK`)
        } else {
            console.log(`Verifying ${url}: MISMATCH`)
        }

        result[repoName].deployed_files.push({
            file: url,
            hash: hash,
            deployed_hash: fileHash,
            ok: isOk
        });
    } catch (error) {
        console.error(`Error verifying file at ${url}: ${error}`);
    }
}

fetchLatestWorkflowRun("station")
    /*.then((run) => downloadAndUnzipArtifact(run, 'MD5 Checksum File'))
    .then((runs) => verifyHashes(runs, "station"))
    .then(() => fetchLatestWorkflowRun("finder"))
    .then((run) => downloadAndUnzipArtifact(run, 'MD5 Checksum File'))
    .then((runs) => verifyHashes(runs, "finder"))*/
    .then(() => fetchLatestWorkflowRun("station-extension", 'chrome', 3))
    .then((run) => downloadAndUnzipArtifact(run, 'MD5 Chrome Extension Checksum File'))
    .then((runs) => verifyExtensionHashes(runs, 'chrome'))
    .then(() => fetchLatestWorkflowRun("station-extension", 'firefox', 3))
    .then((run) => downloadAndUnzipArtifact(run, 'MD5 Firefox Extension Checksum File'))
    .then((runs) => verifyExtensionHashes(runs, 'firefox'))
    .then(() => {
        result["station"].status_ok = result['station'].deployed_files.length > 0 && result["station"].deployed_files.every(file => file.ok);
        result["finder"].status_ok = result['finder'].deployed_files.length > 0 && result["finder"].deployed_files.every(file => file.ok);
        result["extension_chrome"].status_ok = result['extension_chrome'].deployed_files.length > 0 && result["extension_chrome"].deployed_files.every(file => file.ok);
        result["extension_firefox"].status_ok = result['extension_firefox'].deployed_files.length > 0 && result["extension_firefox"].deployed_files.every(file => file.ok);
    })
    .then(() => fs.writeFileSync(resultsFile, JSON.stringify(result, null, 2)))
    .catch(error => {
        console.error(`Error in script: ${error}`)
        console.error(error.stack);
    });
