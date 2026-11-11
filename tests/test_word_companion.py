"""Editable companions must contain document text, not TeX layout arguments."""
from pathlib import Path
import tempfile
import unittest

from docx import Document
from employment_agency.master import plain, word_copy


class WordCompanion(unittest.TestCase):
    def test_plain_latex_profile_section_uses_generic_word_conversion(self):
        source = r"""\documentclass{article}
\begin{document}
\section{Profile}
Built APIs for a regional business.
\subsection*{Skills}
\begin{itemize}
\item Python and SQL
\end{itemize}
\end{document}"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'resume.docx'
            word_copy(source, path)
            paragraphs = [(p.text, p.style.name) for p in Document(path).paragraphs]
        self.assertEqual(paragraphs, [
            ('Profile', 'Heading 1'), ('Built APIs for a regional business.', 'Normal'),
            ('Skills', 'Heading 2'), ('Python and SQL', 'List Bullet'),
        ])

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

    def test_cover_fontsize_and_multiline_contact_groups_copy_only_text(self):
        source = r"""\begin{document}
{\fontsize{25}{28}\selectfont\bfseries\color{navy} ALEX EXAMPLE}\par
{\small Toronto, Canada | Open to relocation\\
alex@example.test | +1 555 0100}
Dear Hiring Team,
I build operational applications.
\end{document}"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cover.docx'
            word_copy(source, path)
            self.assertEqual([p.text for p in Document(path).paragraphs], [
                'ALEX EXAMPLE', 'Toronto, Canada | Open to relocation',
                'alex@example.test | +1 555 0100', 'Dear Hiring Team,',
                'I build operational applications.',
            ])

    def test_cover_preserves_escaped_literal_braces_and_prose(self):
        source = r"""\begin{document}
{\small I use \{label\} with 80\% coverage and navy text.}
\textbf{The \{field\} value is literal.}
\end{document}"""
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'cover.docx'
            word_copy(source, path)
            self.assertEqual([p.text for p in Document(path).paragraphs], [
                'I use {label} with 80% coverage and navy text.',
                'The {field} value is literal.',
            ])

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
