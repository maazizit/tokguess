#!/usr/bin/env node
/**
 * Script démonstration amélioration estimation tokens TokGuess
 * Compare ancienne vs nouvelle formule sur données réelles
 */
declare function oldEstimate(model: string, durationMs: number): {
    input: number;
    output: number;
};
declare function newEstimate(model: string, durationMs: number, context: string): {
    input: number;
    output: number;
};
declare const examples: {
    name: string;
    model: string;
    duration: number;
    context: string;
    realApprox: {
        input: string;
        output: string;
    };
}[];
declare const totalOld: number;
declare const totalNew: number;
