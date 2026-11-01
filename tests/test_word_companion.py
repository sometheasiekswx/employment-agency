"""Editable companions must contain document text, not TeX layout arguments."""
from pathlib import Path
import tempfile
import unittest

from docx import Document
from employment_agency.master import plain, word_copy


class WordCompanion(unittest.TestCase):
    def test_cover_preserves_prose_without_layout_arguments(self):
        source = r"""\documentclass{article}
\usepackage{xcolor}\definecolor{navy}{HTML}{17384D}
\begin{document}
{\LARGE\bfseries\color{navy} Alex Example}\par
Melbourne \textbar\ Open to relocation\par
\vspace{12pt}
\textbf{Application: Engineer}\par
Dear Hiring Team,\par
\vspace{7pt}
I built APIs and reduced manual entry by 80\%.\par
\vspace{8pt}
Kind regards,\par
Alex Example\par
\end{document}"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cover.docx'
            word_copy(source, path)
            paragraphs = [p.text for p in Document(path).paragraphs if p.text.strip()]
        self.assertEqual(paragraphs, [
            'Alex Example', 'Melbourne | Open to relocation', 'Application: Engineer',
            'Dear Hiring Team,', 'I built APIs and reduced manual entry by 80%.',
            'Kind regards,', 'Alex Example',
        ])

    def test_master_separators_do_not_leave_an_escaped_space(self):
        self.assertEqual(plain(r'Instructor \textbar\ IT Manager'), 'Instructor | IT Manager')

    def test_inline_environments_keep_their_content(self):
        source = r"""\begin{document}
\begin{center}Alex Example\end{center}
\begin{itemize}\item Built APIs.\end{itemize}
\end{document}"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cover.docx'
            word_copy(source, path)
            self.assertEqual([p.text for p in Document(path).paragraphs],
                             ['Alex Example', 'Built APIs.'])
