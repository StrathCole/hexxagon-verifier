import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import Collapse from '@mui/material/Collapse';
import IconButton from '@mui/material/IconButton';
import { ExpandMore } from '@mui/icons-material';

const FileCheck = ({ fileCheck }) => {
    const [expanded, setExpanded] = React.useState(false);

    const handleExpandClick = () => {
        setExpanded(!expanded);
    };

    return (
        <Card variant="outlined">
            <CardHeader
                action={
                    <IconButton onClick={handleExpandClick}>
                        <ExpandMore />
                    </IconButton>
                }
                title={
                    <Typography variant="h6">
                        {fileCheck.file}
                        <Box component="span" 
                             ml={2} 
                             bgcolor={fileCheck.ok ? 'green' : 'red'} 
                             color="white" 
                             p={0.5} 
                             borderRadius="4px"
                             style={{ float: 'right' }}>
                            {fileCheck.ok ? 'OK' : 'Mismatch'}
                        </Box>
                    </Typography>
                }
            />
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <CardContent>
                    <Typography variant="body2" component="p">
                        <Box bgcolor="grey.300" p={1} fontFamily="Monospace">
                            Hash: {fileCheck.hash}
                        </Box>
                    </Typography>
                    <Typography variant="body2" component="p">
                        <Box bgcolor="grey.300" p={1} fontFamily="Monospace">
                            Deployed Hash: {fileCheck.deployed_hash}
                        </Box>
                    </Typography>
                </CardContent>
            </Collapse>
        </Card>
    );
}

export default FileCheck;
