import { describe, expect, it } from 'vitest';
import { placeCandidates } from './places';

describe('placeCandidates', () => {
  it.each([
    ['I live in Pune, I cycle to college and my dad has asthma', ['Pune']],
    ['How is the air in Mumbai today?', ['Mumbai']],
    ['We walk in the park every morning in Kolkata', ['Kolkata']],
    ['I stay at Navi Mumbai near Thane Creek', ['Navi Mumbai', 'Thane Creek']],
    ['Should my child play outside at 5 pm?', []],
    ['I am in the morning at home', []],
    ['मैं लखनऊ में रहता हूँ, सुबह पार्क में टहलता हूँ', ['Lucknow']],
    ['आज चंडीगढ़ और नई दिल्ली की हवा', ['Chandigarh', 'Delhi']],
    ['Pune', []],
    [
      'Hello. We moved from Agra to Jaipur and Surat Gujarat Patna Ranchi',
      ['Agra', 'Jaipur', 'Surat Gujarat Patna'],
    ],
  ])('%s', (text, expected) => expect(placeCandidates(text)).toEqual(expected));
});
