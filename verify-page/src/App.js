import React, { useState, useEffect } from 'react';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';
import WorkflowFileCheck from './components/WorkflowFileCheck';
import FileCheckList from './components/FileCheckList';
import { Box, Link, Tabs, Tab } from '@mui/material';

function App() {
    const [result, setResult] = useState({});
    const [tabValue, setTabValue] = useState(0);
    
    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    useEffect(() => {
        const fetchData = async () => {
            const resultData = await fetch(process.env.PUBLIC_URL + '/result.json')
                .then(res => res.json())
                .catch(error => console.error(`Error in fetch: ${error}`));
    
            if (resultData) {
                setResult(resultData);
            } else {
                setResult({});
            }
        };
    
        fetchData();
    }, []);
    
    return (
        <Container maxWidth="lg">
            <Typography variant="h4" component="h1" gutterBottom>
                Check for Terra Classic Deployments
            </Typography>
            <Typography variant="body1" gutterBottom>
                This page checks the files deployed on station.terraclassic.community / finder.terraclassic.community against the files in the repositories.
            </Typography>
            <Typography variant="h6" component="h4" gutterBottom>
                Last Check: {new Date(result?.last_check * 1000).toLocaleString()}
            </Typography>

            <Tabs value={tabValue} onChange={handleTabChange} sx={{mb: 3}}>
              <Tab label={<Box>Home</Box>} value={0} />
                <Tab label={
                    <Box>
                        Terra Classic Station
                        <Box component="span" 
                        ml={2} 
                        bgcolor={result?.station?.status_ok ? 'green' : 'red'} 
                        color="white" 
                        p={1} 
                        borderRadius="4px">
                            {result?.station?.status_ok ? 'Pass' : 'Fail'}
                        </Box>
                    </Box>
                } value={1} />
                <Tab label={
                    <Box>
                        Terra Classic Finder
                        <Box component="span" 
                        ml={2} 
                        bgcolor={result?.finder?.status_ok ? 'green' : 'red'} 
                        color="white" 
                        p={1} 
                        borderRadius="4px">
                            {result?.finder?.status_ok ? 'Pass' : 'Fail'}
                        </Box>
                    </Box>
                } value={2} />
             </Tabs>

            {tabValue === 0 && (
              <>
              <Typography variant="body1" component="p" gutterBottom>
                This page shall verify the integrity of the files deployed on station.terraclassic.community and finder.terraclassic.community.
                <br />
                This is achieved by pulling the latest github actions run for each repository and comparing the hashes of the files deployed on the server with those in the repository.
                </Typography>
                <Typography variant="body1" component="p" gutterBottom>
                The workflow file is also checked to ensure that it has not been changed since the last run.
                </Typography>
                <Typography variant="body1" component="p" gutterBottom>
                  While this page is not a guarantee that the files deployed on the server are correct, it does provide a reasonable level of confidence that the files deployed on the server are the same as those in the repository.
                </Typography>
                </>
              )}

             {tabValue === 1 && result?.station && (
              <>
                <Typography variant="body1" component="p" gutterBottom>
                  <Link href={result?.station?.latest_run_url} target='_blank' rel='noopener noreferer'>Latest Run</Link>
                </Typography>
                
                {result?.station?.workflow_file && <WorkflowFileCheck workflowFile={result?.station?.workflow_file} />}
                {result?.station?.deployed_files && <FileCheckList fileChecks={result.station.deployed_files} />}
                </>
              )}
             {tabValue === 2 && result?.finder && (
              <>
                <Typography variant="body1" component="p" gutterBottom>
                  <Link href={result?.finder?.latest_run_url} target='_blank' rel='noopener noreferer'>Latest Run</Link>
                </Typography>
                
                {result?.finder?.workflow_file && <WorkflowFileCheck workflowFile={result.finder.workflow_file} />}
                {result?.finder?.deployed_files && <FileCheckList fileChecks={result.finder.deployed_files} />}
                </>
              )}
        </Container>
    );
}

export default App;
