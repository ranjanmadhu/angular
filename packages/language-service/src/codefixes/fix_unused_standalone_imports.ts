/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.dev/license
 */

import {ErrorCode, ngErrorCode} from '@angular/compiler-cli/src/ngtsc/diagnostics';
import tss from 'typescript';

import {CodeActionMeta, FixIdForCodeFixesAll} from './utils';
import {findFirstMatchingNode} from '../utils/ts_utils';

/**
 * Fix for [unused standalone imports](https://angular.io/extended-diagnostics/NG8113)
 */
export const fixUnusedStandaloneImportsMeta: CodeActionMeta = {
  errorCodes: [ngErrorCode(ErrorCode.UNUSED_STANDALONE_IMPORTS)],
  getCodeActions: () => [],
  fixIds: [FixIdForCodeFixesAll.FIX_UNUSED_STANDALONE_IMPORTS],
  getAllCodeActions: ({diagnostics}) => {
    const changes: tss.FileTextChanges[] = [];

    for (const diag of diagnostics) {
      const {start, length, file, relatedInformation} = diag;
      if (file === undefined || start === undefined || length == undefined) {
        continue;
      }

      const node = findFirstMatchingNode(file, {
        filter: (
          current,
        ): current is tss.PropertyAssignment & {initializer: tss.ArrayLiteralExpression} =>
          tss.isPropertyAssignment(current) &&
          tss.isArrayLiteralExpression(current.initializer) &&
          current.name.getStart() === start &&
          current.name.getWidth() === length,
      });

      if (node === null) {
        continue;
      }

      const importsArray = node.initializer;
      let newText: string;

      // If `relatedInformation` is empty, it means that all the imports are unused.
      // Replace the array with an empty array.
      if (relatedInformation === undefined || relatedInformation.length === 0) {
        newText = '[]';
      } else {
        // Otherwise each `relatedInformation` entry points to an unused import that should be
        // filtered out. We make a set of ranges corresponding to nodes which will be deleted and
        // remove all nodes that belong to the set.
        const excludeRanges = new Set(
          relatedInformation.reduce((ranges, info) => {
            // If the compiler can't resolve the unused import to an identifier within the array,
            // it falls back to reporting the identifier of the class declaration instead. In theory
            // that class could have the same offsets as the diagnostic location. It's a slim chance
            // that would happen, but we filter out reports from other files just in case.
            if (info.file === file) {
              ranges.push(`${info.start}-${info.length}`);
            }
            return ranges;
          }, [] as string[]),
        );

        const newArray = tss.factory.updateArrayLiteralExpression(
          importsArray,
          importsArray.elements.filter(
            (el) => !excludeRanges.has(`${el.getStart()}-${el.getWidth()}`),
          ),
        );

        newText = tss.createPrinter().printNode(tss.EmitHint.Unspecified, newArray, file);
      }

      changes.push({
        fileName: file.fileName,
        textChanges: [
          {
            span: {start: importsArray.getStart(), length: importsArray.getWidth()},
            newText,
          },
        ],
      });
    }

    return {changes};
  },
};
