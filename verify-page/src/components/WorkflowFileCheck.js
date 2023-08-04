import React from 'react';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Box from '@mui/material/Box';
import { CardHeader, Collapse, IconButton } from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

const WorkflowFileCheck = ({ workflowFile }) => {
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
                        Workflow File Status
                        <Box component="span" 
                            ml={2} 
                            bgcolor={workflowFile.changed ? 'yellow' : 'green'} 
                            color="white" 
                            p={0.5} 
                            borderRadius="4px"
                            style={{ float: 'right' }}>
                            {workflowFile.changed ? 'Changed' : 'Unchanged'}
                        </Box>
                    </Typography>
                }
            />
            <Collapse in={expanded} timeout="auto" unmountOnExit>
                <CardContent>
                    <Typography variant="body2" component="p">
                        <Box bgcolor="grey.300" p={1} fontFamily="Monospace">
                            Current Hash: {workflowFile.hash}
                        </Box>
                    </Typography>
                    <Typography variant="body2" component="p">
                        <Box bgcolor="grey.300" p={1} fontFamily="Monospace">
                            Previous Hash: {workflowFile.prev_hash}
                        </Box>
                    </Typography>
                </CardContent>
            </Collapse>
        </Card>
    );
}

export default WorkflowFileCheck;
