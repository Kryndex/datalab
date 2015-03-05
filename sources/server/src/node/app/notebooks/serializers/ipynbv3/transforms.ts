/*
 * Copyright 2014 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License
 * is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing permissions and limitations under
 * the License.
 */


/**
 * Transformation functions from .ipynb-formatted objects to datalab in-memory notebook types
 */
/// <reference path="../../../../../../../../externs/ts/node/node-uuid.d.ts" />
import nbutil = require('../../util');
import util = require('../../../common/util');
import uuid = require('node-uuid');


export function fromIPyCodeCell (ipyCell: app.ipy.CodeCell): app.notebook.Cell {
  var cell = _createCell();
  cell.type = 'code';
  cell.source = ipyCell.input.join('');
  cell.prompt = ''+ipyCell.prompt_number;
  cell.metadata = ipyCell.metadata || {};
  cell.metadata.language = ipyCell.language;
  cell.outputs = [];

  // Now handle the deserialization of any outputs for the code cell
  ipyCell.outputs.forEach((ipyOutput) => {
    switch (ipyOutput.output_type) {
      case 'display_data': // equivalent to pyout case, fall-through
      case 'pyout':
        cell.outputs.push(fromIPyRichOutput(ipyOutput));
      break;

      case 'stream':
        cell.outputs.push(fromIPyStreamOutput(ipyOutput));
      break;

      case 'pyerr':
        cell.outputs.push(fromIPyErrorOutput(ipyOutput));
      break;

      default:
        console.log('WARNING: skipping unsupported cell output type: ', ipyOutput.output_type);
    }
  });
  return cell;
}

function fromIPyErrorOutput (ipyOutput: any): app.notebook.CellOutput {
  // FIXME store the individual error fields as cell output metadata
  // so that they can be round-tripped without loss of fidelity
  return util.createErrorOutput(
      ipyOutput.ename, ipyOutput.evalue, ipyOutput.traceback);
}

function fromIPyStreamOutput (ipyOutput: any): app.notebook.CellOutput {
  return {
    type: ipyOutput.stream,
    mimetypeBundle: {
      'text/plain': ipyOutput.text.join('')
    }
  }
}

/**
 * from an ipython (v3) format mimetype bundle
 */
function fromIPyRichOutput (ipyOutput: any): app.notebook.CellOutput {
  var output: app.notebook.CellOutput = {
    type: 'result',
    mimetypeBundle: {}
  };

  Object.keys(ipyOutput).forEach((key) => {
    switch(key) {
      case 'png':
        // The base64 encoded png data is the value of the property
        output.mimetypeBundle['image/png'] = ipyOutput.png;
      break;

      case 'html':
        output.mimetypeBundle['text/html'] = ipyOutput.html.join('');
      break;

      case 'text':
        output.mimetypeBundle['text/plain'] = ipyOutput.text.join('');
      break;

      // non-mimetype properties that can exist within the object
      case 'metadata':
      case 'output_type':
      break; // not a mimetype

      default:
        console.log('WARNING: skipping unsupported output mimetype: ', key)
    }
  });

  return output;
}

var DEFAULT_HEADING_LEVEL = 1;
export function fromIPyHeadingCell (ipyCell: app.ipy.HeadingCell): app.notebook.Cell {
  var cell = _createCell();
  cell.type = 'heading';
  cell.source = ipyCell.source.join('');
  cell.metadata = ipyCell.metadata || {};
  cell.metadata.level = ipyCell.level || DEFAULT_HEADING_LEVEL;
  return cell;
}

export function fromIPyMarkdownCell (ipyCell: app.ipy.MarkdownCell): app.notebook.Cell {
  var cell = _createCell();
  cell.type = 'markdown';
  cell.source = ipyCell.source.join('');
  cell.metadata = ipyCell.metadata || {};
  return cell;
}

export function fromIPyNotebook (ipyNotebook: app.ipy.Notebook): app.notebook.Notebook {
  var notebook = nbutil.createEmptyNotebook();
  // Copy over the notebook-level metadata if it was defined
  notebook.metadata = ipyNotebook.metadata || {};

  // Notebooks created by IPython in v3 format will have zero or one worksheet(s)
  // because no existing IPython tools are capable of creating/reading multiple worksheets.
  //
  // As part of DataLab's multi-worksheet support, DataLab may export multi-worksheet .ipynb
  // but this is unlikely since no other tools will be able to read beyond the first worksheet.
  //
  // Thus, assume zero or one worksheet, but throw an informative error if these expectations are
  // not met.
  if (ipyNotebook.worksheets.length === 0) {
    // Nothing else to convert from ipynb format
    return notebook;
  } else if (ipyNotebook.worksheets.length > 1) {
    //
    throw new Error('Multi-worksheet .ipynb notebooks are not currently supported');
  }

  // Then the .ipynb notebook has a single worksheet
  var ipynbWorksheet = ipyNotebook.worksheets[0];

  // Get a reference to the first worksheet in the converted notebook
  var worksheet = notebook.worksheets[notebook.worksheetIds[0]];
  worksheet.metadata = ipynbWorksheet.metadata || {};

  ipynbWorksheet.cells.forEach(function (ipyCell: any) {
    var cell: app.notebook.Cell;
    switch (ipyCell.cell_type) {
      case 'markdown':
        cell = fromIPyMarkdownCell(<app.ipy.MarkdownCell>ipyCell);
        break;
      case 'code':
        cell = fromIPyCodeCell(<app.ipy.CodeCell>ipyCell);
        break;
      case 'heading':
        cell = fromIPyHeadingCell(<app.ipy.HeadingCell>ipyCell);
        break;
      default:
        console.log('WARNING: skipping unsupported cell type: ', ipyCell.cell_type);
    }
    // Attach the converted cell to the worksheet
    worksheet.cells.push(cell);
  });

  return notebook;
}

export function toIPyCodeCell (cell: app.notebook.Cell): app.ipy.CodeCell {
  var ipyCell: app.ipy.CodeCell = {
    cell_type: 'code',
    input: [],
    collapsed: false,
    metadata: cell.metadata || {},
    // Attempt to set the language for the cell if defined, if not, leave undefined
    language: (cell.metadata && cell.metadata.language) || undefined,
    // Set the prompt number if the value is numeric, otherwise leave undefined
    prompt_number: parseInt(cell.prompt) || undefined,
    outputs: []
  };

  cell.outputs.forEach((output) => {
    switch (output.type) {
      case 'result':

      break;

      case 'error':

      break;

      case 'stdout':

      break;

      case 'stderr':

      break;

      default:
        throw new Error('Unsupported output type for conversion to IPython cell output: "'
          + output.type + '"');
    }
  });

  return ipyCell;
}

function toIPyRichOutput (output: app.notebook.CellOutput): app.ipy.DisplayDataOutput {
  return null;
}

function toIPyErrorOutput (output: app.notebook.CellOutput): app.ipy.ErrorOutput {
  // FIXME recreate the individual error fields here eventually when they
  // are being persisted into the cell output's metadata dict both on ingestion
  // of ipynb content and as part of error-based execute reply responses
  return {
    output_type: 'pyerr',
    ename: 'todo',
    evalue: 'todo',
    traceback: ['todo']
  }
  return null;
}

function toIPyStreamOutput (output: app.notebook.CellOutput): app.ipy.StreamOutput {
  return {
    output_type: 'stream',
    stream: output.type,
    text: stringToLineArray(output.mimetypeBundle['text/plain']) || [],
    metadata: output.metadata || {}
  }
}

/**
 * Convert a string containing newlines into an array of strings, while keeping newlines
 *
 * s = 'foo\nbar\nbaz' => ['foo\n', 'bar\n', 'baz']
 */
export function stringToLineArray (s: string): string[] {
  if (!s) {
    return [];
  }

  return s.split('\n').map((line, i, lines) => {
    // Avoid appending a newline to the last line
    if (i < lines.length - 1) {
      return line + '\n';
    } else {
      return line;
    }
  });
}

export function toIPyHeadingCell (cell: app.notebook.Cell): app.ipy.HeadingCell {
  return null;
}

export function toIPyMarkdownCell (cell: app.notebook.Cell): app.ipy.MarkdownCell {
  return null;
}

export function toIPyNotebook (notebook: app.notebook.Notebook): app.ipy.Notebook {
  return null;
}


function _createCell (): app.notebook.Cell {
  return {
    id: uuid.v4(),
    metadata: {}
  };
}
