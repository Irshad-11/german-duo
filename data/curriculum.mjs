// Initial curriculum (editable in the app). Every item references a file from data/library-tree.txt
// by "<LEVEL>:<filename prefix>". The generator fails if a reference is missing or ambiguous.
// IMPORTANT: sequencing is inferred from FILENAMES and METADATA ONLY. No file contents were read.
// Page ranges are only given as 'all' for small files (whole file, count from metadata).
// For large books pages is null => the learners choose the range from the book's table of contents.

const L = (ref, role, pages, minutes, note) => ({ ref, role, pages, minutes, note });

export const weeks = [
  // ───────────── A1 (weeks 1–16) ─────────────
  { week: 1, level: 'A1', theme: 'Sounds, alphabet, farewells', goal: 'Read the alphabet aloud and say hello/goodbye confidently.', items: [
    L('A1:Class-01 (', 'lesson', null, 30, 'Image lesson: alphabet. Read aloud twice.'),
    L('A1:Class-04 (', 'lesson', null, 20, 'Image lesson: farewells.'),
    L('A1:Menschen A1-1', 'coursebook', null, 90, 'Pick the first unit from the table of contents.'),
    L('A1:A1-Glossary', 'vocab', null, 40, 'Pick the first glossary section.'),
  ]},
  { week: 2, level: 'A1', theme: 'Days and months', goal: 'Name days and months; first short story.', items: [
    L('A1:Class-05 (', 'lesson', null, 20),
    L('A1:Class-06 (', 'lesson', null, 20),
    L('A1:A1 Story Part 1.', 'story', 'all', 30, 'Read the story, note unknown words.'),
    L('A1:Menschen A1-1', 'coursebook', null, 90, 'Next unit after last week.'),
  ]},
  { week: 3, level: 'A1', theme: 'Ordinals and telling time', goal: 'Say dates and clock times.', items: [
    L('A1:Class-10 (', 'lesson', 'all', 25),
    L('A1:Class-11 (', 'lesson', 'all', 40),
    L('A1:Menschen A1-1', 'coursebook', null, 90),
  ]},
  { week: 4, level: 'A1', theme: 'sein and haben', goal: 'Conjugate sein/haben and regular verbs.', items: [
    L('A1:Class-15 (', 'lesson', 'all', 30),
    L('A1:Class-16 (', 'lesson', 'all', 30),
    L('A1:Menschen A1-1', 'coursebook', null, 90),
  ]},
  { week: 5, level: 'A1', theme: 'Yes/no questions', goal: 'Ask and answer simple questions.', items: [
    L('A1:Class-19 (', 'lesson', 'all', 20),
    L('A1:A1 Story Part 7.', 'story', 'all', 30),
    L('A1:Menschen A1-1', 'coursebook', null, 90),
    L('A1:Grammatik_aktiv', 'reference', null, 30, 'Look up only the topics from this week.'),
  ]},
  { week: 6, level: 'A1', theme: 'Time prepositions', goal: 'Use am/um/im with time expressions.', items: [
    L('A1:Class-20 (', 'lesson', 'all', 35),
    L('A1:A1 Story Part 8.', 'story', 'all', 30),
    L('A1:Menschen A1-1', 'coursebook', null, 90, 'Finish the book over the next weeks.'),
  ]},
  { week: 7, level: 'A1', theme: 'Cases and Nominativ', goal: 'Understand what a case is; recognise Nominativ.', items: [
    L('A1:Class-23 (', 'lesson', 'all', 20),
    L('A1:Class-24 (', 'lesson', 'all', 35),
    L('A1:Menschen A1-1', 'coursebook', null, 90),
  ]},
  { week: 8, level: 'A1', theme: 'Akkusativ and its prepositions', goal: 'Use Akkusativ after common prepositions.', items: [
    L('A1:Class-26 (', 'lesson', 'all', 35),
    L('A1:A1 Story Part 9.', 'story', 'all', 30),
    L('A1:Menschen A1-2', 'coursebook', null, 90, 'Start the second A1 coursebook.'),
  ]},
  { week: 9, level: 'A1', theme: 'Sentence structure', goal: 'Build main clauses with correct verb position.', items: [
    L('A1:Class-30 (', 'lesson', 'all', 35),
    L('A1:Menschen A1-2', 'coursebook', null, 90),
    L('A1:Grammatik_aktiv', 'reference', null, 30),
  ]},
  { week: 10, level: 'A1', theme: 'Consolidation I', goal: 'Review weeks 1–9; re-read two class sheets.', items: [
    L('A1:A1 Story Part 11.', 'story', 'all', 30),
    L('A1:Menschen A1-2', 'coursebook', null, 90),
    L('A1:Basic german', 'reference', null, 45, 'Skim and pick revision topics.'),
  ]},
  { week: 11, level: 'A1', theme: 'Reading practice', goal: 'Read longer A1 texts with a vocabulary list.', items: [
    L('A1:A1 Story Part 12.', 'story', 'all', 30),
    L('A1:Netzwerk-neu-a1-kursbuch', 'coursebook', null, 90, 'Second opinion on topics from the Menschen books.'),
    L('A1:Netzwerk neu A1 Bangla Glossar', 'vocab', null, 40),
  ]},
  { week: 12, level: 'A1', theme: 'Second-source practice', goal: 'Practise the same topics from a different textbook.', items: [
    L('A1:Schritte plus neu A1.2', 'coursebook', null, 90),
    L('A1:Menschen A1-2', 'coursebook', null, 60, 'Finish remaining units.'),
  ]},
  { week: 13, level: 'A1', theme: 'Everyday reading and extra units', goal: 'Mix extra units with a real-world text.', items: [
    L('A1:Momente A1', 'coursebook', null, 75),
    L('A1:Spektrum Deutsch', 'coursebook', null, 75),
    L('A1:Zeitung BAS', 'reading', null, 20, 'Optional: skim headlines only; not A1 level.'),
  ]},
  { week: 14, level: 'A1', theme: 'A1 exam practice I', goal: 'Complete one practice set under time limits.', items: [
    L('A1:fit1_uebungssatz_01', 'exam', 'all', 120, 'Whole practice set (52 pages per metadata).'),
    L('A1:a1-loesungen', 'exam', 'all', 45, 'Answer key (inferred from filename — verify it matches the set).'),
  ]},
  { week: 15, level: 'A1', theme: 'A1 exam practice II', goal: 'Targeted exam training on weak areas.', items: [
    L('A1:a1-pr_', 'exam', null, 90, 'Choose one exam model.'),
    L('A1:pruefungstraining-a1', 'exam', null, 90, 'Choose sections matching weak skills.'),
    L('A1:2003juv17556', 'reference', null, 30, 'Content not verified; open and decide whether it is useful.'),
  ]},
  { week: 16, level: 'A1', theme: 'A1 review and gap week', goal: 'Close gaps; decide if ready for A2.', items: [
    L('A1:Class-16 (', 'review', 'all', 20),
    L('A1:Class-30 (', 'review', 'all', 20),
    L('A1:Speak German', 'reference', null, 60, 'Use for extra speaking phrases only.'),
  ]},

  // ───────────── A2 (weeks 17–34) ─────────────
  { week: 17, level: 'A2', theme: 'Tenses overview', goal: 'See present, perfect and preterite side by side.', items: [
    L('A2:Class-3 (', 'lesson', 'all', 30),
    L('A2:Menschen A2.1', 'coursebook', null, 90, 'Start the A2 coursebook.'),
  ]},
  { week: 18, level: 'A2', theme: 'Connectors', goal: 'Join sentences with weil/dass/denn/aber.', items: [
    L('A2:Class-4 (', 'lesson', 'all', 45),
    L('A2:Menschen A2.1', 'coursebook', null, 90),
  ]},
  { week: 19, level: 'A2', theme: 'Reflexive verbs', goal: 'Use reflexive pronouns correctly.', items: [
    L('A2:Class-5 (', 'lesson', 'all', 40),
    L('A2:Kapitel-6.', 'story', 'all', 30),
    L('A2:Menschen A2.1', 'coursebook', null, 90),
  ]},
  { week: 20, level: 'A2', theme: 'als and wenn', goal: 'Choose als vs wenn in subordinate clauses.', items: [
    L('A2:Class-8 (', 'lesson', 'all', 30),
    L('A2:Menschen A2.1', 'coursebook', null, 90),
  ]},
  { week: 21, level: 'A2', theme: 'Genitiv', goal: 'Recognise and form simple Genitiv phrases.', items: [
    L('A2:Class-9 (', 'lesson', 'all', 35),
    L('A2:Menschen A2.1', 'coursebook', null, 90),
  ]},
  { week: 22, level: 'A2', theme: 'Comparison', goal: 'Compare with Positiv/Komparativ/Superlativ.', items: [
    L('A2:Class-10 (', 'lesson', 'all', 30),
    L('A2:Kapitel-8.', 'story', 'all', 30),
    L('A2:Menschen A2.1', 'coursebook', null, 75),
  ]},
  { week: 23, level: 'A2', theme: 'Two-way prepositions', goal: 'Choose Akkusativ/Dativ after Wechselpräpositionen.', items: [
    L('A2:Class-13 (', 'lesson', 'all', 40),
    L('A2:Menschen A2.2', 'coursebook', null, 90, 'Start the second A2 coursebook.'),
  ]},
  { week: 24, level: 'A2', theme: 'Prepositions with verbs', goal: 'Learn common verb + preposition pairs.', items: [
    L('A2:Class-15 (', 'lesson', 'all', 20),
    L('A2:Class-16 (', 'lesson', 'all', 30),
    L('A2:Menschen A2.2', 'coursebook', null, 90),
  ]},
  { week: 25, level: 'A2', theme: 'Relative clauses', goal: 'Build relative clauses with the right pronoun.', items: [
    L('A2:Class-17 (', 'lesson', 'all', 35),
    L('A2:Menschen A2.2', 'coursebook', null, 90),
  ]},
  { week: 26, level: 'A2', theme: 'Indirect questions', goal: 'Report questions with ob and W-words.', items: [
    L('A2:Class-18 (', 'lesson', 'all', 35),
    L('A2:Menschen A2.2', 'coursebook', null, 90),
  ]},
  { week: 27, level: 'A2', theme: 'Konjunktiv II', goal: 'Polite requests and wishes.', items: [
    L('A2:Class-19 (', 'lesson', 'all', 50),
    L('A2:Kapitel-11.', 'story', 'all', 30),
    L('A2:Menschen A2.2', 'coursebook', null, 75),
  ]},
  { week: 28, level: 'A2', theme: 'Question articles', goal: 'Use welcher/was für ein.', items: [
    L('A2:Class-21 (', 'lesson', 'all', 30),
    L('A2:Schritte plus neu A2.1', 'coursebook', null, 90),
  ]},
  { week: 29, level: 'A2', theme: 'Second-source practice', goal: 'Practise A2 topics from another coursebook.', items: [
    L('A2:Schritte plus neu A2.1', 'coursebook', null, 90),
    L('A2:Menschen A2.2', 'coursebook', null, 60, 'Finish remaining units.'),
  ]},
  { week: 30, level: 'A2', theme: 'Consolidation II', goal: 'Review weeks 17–29; re-read class sheets.', items: [
    L('A2:Class-4 (', 'review', 'all', 25),
    L('A2:Class-19 (', 'review', 'all', 30),
    L('A2:Prüfungstraining A2', 'exam', null, 60),
  ]},
  { week: 31, level: 'A2', theme: 'A2 exam training', goal: 'Practise exam task types.', items: [
    L('A2:Prüfungstraining A2', 'exam', null, 120, 'Choose sections matching weak skills.'),
  ]},
  { week: 32, level: 'A2', theme: 'A2 model test 1', goal: 'Full timed model test.', items: [
    L('A2:A2_model 01', 'exam', 'all', 150, 'Whole set (48 pages per metadata).'),
  ]},
  { week: 33, level: 'A2', theme: 'A2 model test 2', goal: 'Second model test and telc format.', items: [
    L('A2:A2_model 02', 'exam', 'all', 150),
    L('A2:telc - deutsch', 'exam', 'all', 60),
  ]},
  { week: 34, level: 'A2', theme: 'A2 review and gap week', goal: 'Close gaps; decide if ready for B1.', items: [
    L('A2:Class-13 (', 'review', 'all', 25),
    L('A2:Class-16 (', 'review', 'all', 25),
  ]},

  // ───────────── B1 start (weeks 35–52) ─────────────
  { week: 35, level: 'B1', theme: 'B1 kick-off: infinitive with zu', goal: 'Form infinitive clauses with zu.', items: [
    L('B1:Class-1 (', 'lesson', 'all', 30),
    L('B1:Netzwerk B1', 'coursebook', null, 90, 'Start the B1 coursebook.'),
    L('B1:Goethe Zertifiket', 'vocab', null, 30, 'Pick the first word-list section.'),
  ]},
  { week: 36, level: 'B1', theme: 'Past perfect', goal: 'Use Plusquamperfekt in narration.', items: [
    L('B1:Class-4 (', 'lesson', 'all', 30),
    L('B1:Kapitel-1.', 'story', 'all', 35),
    L('B1:Netzwerk B1', 'coursebook', null, 90),
  ]},
  { week: 37, level: 'B1', theme: 'Connectors I', goal: 'Master B1 connectors.', items: [
    L('B1:Class-5 (', 'lesson', 'all', 40),
    L('B1:Class-11 (', 'lesson', 'all', 30),
    L('B1:Netzwerk B1', 'coursebook', null, 75),
  ]},
  { week: 38, level: 'B1', theme: 'Paired connectors and je…desto', goal: 'Use entweder…oder, sowohl…als auch, je…desto.', items: [
    L('B1:Class-6 (', 'lesson', 'all', 40),
    L('B1:Class-7 (', 'lesson', 'all', 20),
    L('B1:Netzwerk B1', 'coursebook', null, 75),
  ]},
  { week: 39, level: 'B1', theme: 'Genitive prepositions, n-declension', goal: 'Handle wegen/trotz and n-nouns.', items: [
    L('B1:Class-8 (', 'lesson', 'all', 30),
    L('B1:Class-9 (', 'lesson', 'all', 35),
    L('B1:Netzwerk B1', 'coursebook', null, 75),
  ]},
  { week: 40, level: 'B1', theme: 'Passive with modal verbs; clause structure', goal: 'Build passive and complex sentences.', items: [
    L('B1:Class-13 (', 'lesson', 'all', 30),
    L('B1:Class-14 (', 'lesson', 'all', 30),
    L('B1:Netzwerk B1', 'coursebook', null, 75),
  ]},
  { week: 41, level: 'B1', theme: 'Reading and phrases', goal: 'Read B1 stories; collect set phrases.', items: [
    L('B1:Kapitel-2.', 'story', 'all', 30),
    L('B1:Kapitel-3.', 'story', 'all', 30),
    L('B1:Redemittels', 'reference', null, 40, 'Pick the sections for speaking and writing.'),
  ]},
  { week: 42, level: 'B1', theme: 'Vocabulary building', goal: 'Learn B1 vocabulary from two glossaries.', items: [
    L('B1:B1 Bangla', 'vocab', null, 60),
    L('B1:Goethe Zertifiket', 'vocab', null, 60),
    L('B1:Netzwerk B1', 'coursebook', null, 60),
  ]},
  { week: 43, level: 'B1', theme: 'Coursebook progress', goal: 'Steady coursebook work.', items: [
    L('B1:Netzwerk B1', 'coursebook', null, 120),
    L('B1:Kapitel-4.', 'story', 'all', 30),
  ]},
  { week: 44, level: 'B1', theme: 'Coursebook progress', goal: 'Steady coursebook work.', items: [
    L('B1:Netzwerk B1', 'coursebook', null, 120),
    L('B1:Kapitel-7.', 'story', 'all', 30),
  ]},
  { week: 45, level: 'B1', theme: 'Review I', goal: 'Re-read connector and tense sheets.', items: [
    L('B1:Class-5 (', 'review', 'all', 25),
    L('B1:Class-6 (', 'review', 'all', 25),
    L('B1:Class-4 (', 'review', 'all', 20),
  ]},
  { week: 46, level: 'B1', theme: 'Coursebook progress', goal: 'Steady coursebook work.', items: [
    L('B1:Netzwerk B1', 'coursebook', null, 120),
    L('B1:Kapitel-12.', 'story', 'all', 30),
  ]},
  { week: 47, level: 'B1', theme: 'Speaking and writing phrases', goal: 'Practise using Redemittel in your own sentences.', items: [
    L('B1:Redemittels', 'reference', null, 60),
    L('B1:Netzwerk B1', 'coursebook', null, 60),
  ]},
  { week: 48, level: 'B1', theme: 'Coursebook progress', goal: 'Steady coursebook work.', items: [
    L('B1:Netzwerk B1', 'coursebook', null, 120),
  ]},
  { week: 49, level: 'B1', theme: 'Review II', goal: 'Re-read grammar sheets.', items: [
    L('B1:Class-13 (', 'review', 'all', 25),
    L('B1:Class-14 (', 'review', 'all', 25),
    L('B1:Class-1 (', 'review', 'all', 20),
  ]},
  { week: 50, level: 'B1', theme: 'Vocabulary consolidation', goal: 'Review all B1 words learned so far.', items: [
    L('B1:Goethe Zertifiket', 'vocab', null, 60),
    L('B1:B1 Bangla', 'vocab', null, 60),
  ]},
  { week: 51, level: 'B1', theme: 'Coursebook progress', goal: 'Steady coursebook work.', items: [
    L('B1:Netzwerk B1', 'coursebook', null, 120),
  ]},
  { week: 52, level: 'B1', theme: 'Year review and next plan', goal: 'Review the year; decide how to extend the plan into B1 and B2.', items: [
    L('B1:Redemittels', 'review', null, 40),
    L('B2:Schreiben B2 Goethe 2', 'reference', null, 30, 'Look ahead only; B2 is outside the first-year target.'),
  ]},
];
