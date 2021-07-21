'use strict';

import * as vscode from 'vscode';

const NAME = 'blankLinePlus';
const COMMAND = 'process';
const CONTEXT_SAVE = 'save';
const CONTEXT_COMMAND = 'command';

// Configuration definition
interface ExtensionConfig {
    keepOneEmptyLine?: boolean;
    triggerOnSave?: boolean;
    insertLineAfterBlock?: boolean;
    allowElseAfterBlock?: boolean;
    formatIfElseBlock?: string;
    removeBlockPadding?: boolean;
    languageIds?: string[];
}

// Default configuration
let config: ExtensionConfig = {
    keepOneEmptyLine: true,
    triggerOnSave: true,
    insertLineAfterBlock: true,
    allowElseAfterBlock: true,
    formatIfElseBlock: '1tbs',
    removeBlockPadding: true,
    languageIds: ['javascript', 'typescript', 'json']
};

// Read extension configuration
function readConfig() {
    let settings = vscode.workspace.getConfiguration(NAME);
    config = Object.assign({}, config, settings);
}

// Check for language validity
function isValidLanguage(languageId: string) {
    if (config === undefined || !(config.languageIds instanceof Array) || config.languageIds.length === 0) { return true; }
    return config.languageIds.find(id => id.toLowerCase() === languageId.toLowerCase()) !== undefined;
}

// Remove empty lines
function processLines(lines: vscode.TextLine[]): string[] {
    return (lines || [])
        .reduce((a: any[], line) => {
            const lineTrimmed = line.text.trim();

            let prevLine: any = a.slice(-1)[0];
            if (prevLine) {
                const prevLineText = prevLine.text !== undefined ? prevLine.text : prevLine;
                const prevLineTrimmed = prevLineText.trim();
                // If previous line and current line are empty, skip
                if (prevLine.isEmptyOrWhitespace && line.isEmptyOrWhitespace)
                    return a;

                if (config.removeBlockPadding) {
                    // If current line is empty and previous line ended with '{', skip
                    if (line.isEmptyOrWhitespace && prevLineTrimmed[prevLineTrimmed.length - 1] === '{')
                        return a;

                    // If previous line is empty and current line starts with '}', remove previous line
                    if (prevLine.isEmptyOrWhitespace && startsWithClosingBrace(line.text))
                        a.pop();
                }

                if (config.formatIfElseBlock === '1tbs') {
                    // If previous line starts with '}' and current line starts with 'else', concatenate
                    if (prevLineTrimmed === '}' && startsWithElse(line.text)) {
                        a.pop();
                        a.push(prevLineText + ' ' + lineTrimmed);
                        return a;
                    }
                }

                if (config.formatIfElseBlock === '1tbs' || config.formatIfElseBlock === 'stroustrup') {
                    // If previous line is if or else and current line is opening brace, concatenate
                    if (isIfOrElseWithoutOpenBrace(prevLineTrimmed) && lineTrimmed === '{') {
                        a.pop();
                        a.push(prevLineText + ' ' + lineTrimmed);
                        return a;
                    }
                }

                if (config.insertLineAfterBlock) {
                    // If previous line starts with '}' and current line is not a closing brace/tag, add a blank line
                    if (prevLineTrimmed === '}' && !line.isEmptyOrWhitespace && !startsWithClosingBraceOrTag(line.text)) {
                        if (!config.allowElseAfterBlock || !startsWithElse(line.text))
                            a.push(null);
                    }
                }
            }

            if (config.formatIfElseBlock === 'stroustrup' || config.formatIfElseBlock === 'allman') {
                // If line starts with '} else', split
                if (lineTrimmed.startsWith('}') && testWords(lineTrimmed, ['else', 'catch', 'finally'])) {
                    const index = line.text.indexOf('}');
                    a.push(line.text.substr(0, index + 1));

                    const newLine = line.text.substr(0, index) + line.text.substr(index + 2);
                    const newLineTrimmed = newLine.trim();
                    if (config.formatIfElseBlock === 'allman') {
                        // If line has other text and ends with '{', split
                        if (isIfOrElseWithOpenBrace(newLineTrimmed)) {
                            a.push(newLine.substr(0, newLineTrimmed.length - 1));
                            const firstNonWhitespaceCharacterIndex = newLine.length - newLine.trimStart().length;
                            a.push(newLine.substr(0, firstNonWhitespaceCharacterIndex) + '{');
                        }
                    } else {
                        a.push(newLine);
                    }

                    return a;
                }
            }

            if (config.formatIfElseBlock === 'allman') {
                // If line has other text and ends with '{', split
                if (isIfOrElseWithOpenBrace(lineTrimmed)) {
                    a.push(line.text.substr(0, line.text.length - 1));
                    a.push(line.text.substr(0, line.firstNonWhitespaceCharacterIndex) + '{');
                    return a;
                }
            }

            // If line is empty, skip
            if (config.keepOneEmptyLine !== true && line.isEmptyOrWhitespace)
                return a;

            return a.concat([line]);
        }, []).map(line => {
            if (!line)
                return '';

            if (line.text !== undefined)
                return line.text;

            return line;
        });
}

function startsWithClosingBrace(text: string) {
    const trimmed = text.trim()[0];
    if (trimmed.length === 0) { return false; }
    return trimmed === '}' || trimmed === ']' || trimmed === ')';
}

function startsWithClosingTag(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) { return false; }
    return trimmed.startsWith('</');
}

function startsWithClosingBraceOrTag(text: string) {
    return startsWithClosingBrace(text) || startsWithClosingTag(text);
}

function testWord(text: string, word: string) {
    const regexp = new RegExp('\\b' + word + '\\b');
    return regexp.test(text);
}

function testWords(text: string, words: string[]) {
    return words.some(word => testWord(text, word));
}

function startsWithElse(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) { return false; }
    return testWords(trimmed, ['else', 'catch', 'finally']) && !trimmed.startsWith('}');
}

function isIfOrElseWithOpenBrace(text: string) {
    const trimmed = text.trim();
    return testWords(trimmed, ['if', 'else', 'try', 'catch', 'finally']) && trimmed.endsWith('{');
}

function isIfOrElseWithoutOpenBrace(text: string) {
    const trimmed = text.trim();
    return testWords(trimmed, ['if', 'else', 'try', 'catch', 'finally']) && !trimmed.endsWith('{');
}

function selectLines(editor: vscode.TextEditor, start: number, end: number) {
    var lines = [];
    for (let lineIndex = start; lineIndex < end; lineIndex++) {
        lines.push(editor.document.lineAt(lineIndex));
    }

    return lines;
}

function doAction(event: string) {
    // Get active text editor
    var editor = vscode.window.activeTextEditor;

    // Do nothing if 'doAction' was triggered by save and 'removeOnSave' is set to false
    if (event === CONTEXT_SAVE && config.triggerOnSave !== true) { return; }

    // Do nothing if no open text editor
    if (!editor) { return; }

    // Do nothing if not valid language
    if (event !== CONTEXT_COMMAND && !isValidLanguage(editor.document.languageId)) { return; }

    // Select start and end lines
    var selection = editor.selection;
    var start = 0;
    var end = editor.document.lineCount;
    if (selection.start.line !== selection.end.line) {
        start = selection.start.line;
        end = selection.end.line;
    }

    // Select text
    var lines = selectLines(editor, start, end);

    // This where magic happens
    var processedLines = processLines(lines);

    // Do nothing if there is no change
    if (lines.map((line: vscode.TextLine) => line.text).join('\n') === processedLines.join('\n')) { return; }

    if (end !== editor.document.lineCount) {
        processedLines.push('');
    }

    // Format text
    editor.edit((edit) => {
        edit.replace(new vscode.Range(start, 0, end, 0), processedLines.join('\n'));
    });

    if (event === CONTEXT_SAVE) {
        editor.document.save();
    }
}

export function activate(context: vscode.ExtensionContext) {
    // Initialize configuration
    readConfig();

    // Reload configuration on change
    vscode.workspace.onDidChangeConfiguration(readConfig);

    // Register command
    context.subscriptions.push(vscode.commands.registerCommand(`${NAME}.${COMMAND}`, () => doAction(CONTEXT_COMMAND)));

    // Listen for save event
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(() => doAction(CONTEXT_SAVE)));
}

export function deactivate() { }