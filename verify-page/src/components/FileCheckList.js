import React from 'react';
import FileCheck from './FileCheck';
import List from '@mui/material/List';

const FileCheckList = ({ fileChecks }) => {
    return (
        <List>
            {fileChecks.map((fileCheck, index) => (
                <FileCheck key={index} fileCheck={fileCheck} />
            ))}
        </List>
    );
}

export default FileCheckList;
