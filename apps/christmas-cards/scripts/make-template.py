#!/usr/bin/env python3
"""Builds public/yondr-christmas-card-list.xlsx, the styled address spreadsheet staff download, fill in and upload.

Run from apps/christmas-cards:  python3 scripts/make-template.py   (needs openpyxl and node)
Re-run it if the department list changes (Admin > Settings), so the spreadsheet's dropdown matches.
The first sheet must stay "Clients" with the header in row 1: the upload reads the first sheet.
"""
import json, subprocess, sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.worksheet.datavalidation import DataValidation

DEPARTMENTS = ['Education', 'Commercial', 'Entertainment', 'Operations']
FIRST = ['US', 'GB', 'MX']  # same order as the web form

# Country names in English, from the same list the web form uses (Intl.DisplayNames in Node).
codes = subprocess.run(['node', '-e', '''
const src = require("fs").readFileSync("public/shared.js", "utf8");
const codes = /const CODES = '([^']+)'/.exec(src)[1].split(" ");
const n = new Intl.DisplayNames(["en"], { type: "region" });
console.log(JSON.stringify(codes.map((c) => [c, n.of(c)])));
'''], capture_output=True, text=True, check=True).stdout
pairs = json.loads(codes)
names = dict(pairs)
countries = [names[c] for c in FIRST] + sorted((n for c, n in pairs if c not in FIRST), key=str.casefold)

FOREST, LICHEN, OFFWHITE, MOSS, MIST, PAPER, LINE = '1C300B', 'DAFF6B', 'F4F9D1', '4F6B35', 'EEF2E6', 'F7F8F1', 'DFE3D3'
FONT = 'Arial'
thin = Side(style='thin', color=LINE)

COLUMNS = [  # header, required, width, note
    ('Name', True, 24, 'Name as it should appear on the envelope, e.g. Jane Smith.'),
    ('Company', False, 24, 'Optional.'),
    ('Job title', False, 22, 'Optional.'),
    ('Department', False, 18, 'Your Yondr department. Pick from the list, or choose one for the whole sheet when you upload.'),
    ('Street address', True, 30, 'Building number and street, e.g. 1600 Amphitheatre Pkwy.'),
    ('Address line 2', False, 20, 'Optional: suite, floor or apartment.'),
    ('City', True, 18, 'City or town.'),
    ('State / region', True, 16, 'Required for the US, Mexico, Canada and Australia (e.g. CA, Jalisco). Optional elsewhere.'),
    ('ZIP / postal code', True, 16, 'Keep leading zeros, e.g. 02134. This column is formatted as text.'),
    ('Country', True, 22, 'Pick from the list. United States, United Kingdom and Mexico are at the top.'),
    ('Email', False, 26, 'Optional.'),
    ('Notes', False, 34, 'Optional: anything the card team should know.'),
]
ROWS = 500

wb = Workbook()
ws = wb.active
ws.title = 'Clients'
ws.sheet_properties.tabColor = FOREST
for i, (head, req, width, note) in enumerate(COLUMNS, start=1):
    c = ws.cell(row=1, column=i, value=head)
    c.font = Font(name=FONT, bold=True, size=11, color=LICHEN if req else OFFWHITE)
    c.fill = PatternFill('solid', fgColor=FOREST if req else MOSS)
    c.alignment = Alignment(vertical='center', horizontal='left', indent=1)
    c.comment = Comment(('Required. ' if req else '') + note, 'Yondr card team', width=260, height=90)
    ws.column_dimensions[c.column_letter].width = width
ws.row_dimensions[1].height = 32
for r in range(2, ROWS + 2):
    for i, (head, *_rest) in enumerate(COLUMNS, start=1):
        c = ws.cell(row=r, column=i)
        c.font = Font(name=FONT, size=11)
        c.border = Border(bottom=thin)
        if r % 2 == 0:
            c.fill = PatternFill('solid', fgColor='FBFCF8')
        if head == 'ZIP / postal code':
            c.number_format = '@'
ws.freeze_panes = 'A2'
ws.auto_filter.ref = f'A1:{ws.cell(row=1, column=len(COLUMNS)).column_letter}1'

# Hidden lists for the dropdowns.
lists = wb.create_sheet('Lists')
lists['A1'], lists['B1'] = 'Countries', 'Departments'
for r, n in enumerate(countries, start=2):
    lists.cell(row=r, column=1, value=n)
for r, n in enumerate(DEPARTMENTS, start=2):
    lists.cell(row=r, column=2, value=n)
lists.sheet_state = 'hidden'

col = {h: ws.cell(row=1, column=i).column_letter for i, (h, *_r) in enumerate(COLUMNS, start=1)}
dv_country = DataValidation(type='list', formula1=f'=Lists!$A$2:$A${len(countries) + 1}', allow_blank=True,
                            showErrorMessage=True, errorStyle='warning', errorTitle='Country',
                            error='Pick a country from the list so we can check the address.')
dv_country.add(f'{col["Country"]}2:{col["Country"]}{ROWS + 1}')
dv_dept = DataValidation(type='list', formula1=f'=Lists!$B$2:$B${len(DEPARTMENTS) + 1}', allow_blank=True,
                         showErrorMessage=True, errorStyle='warning', errorTitle='Department', error='Pick a department from the list.')
dv_dept.add(f'{col["Department"]}2:{col["Department"]}{ROWS + 1}')
ws.add_data_validation(dv_country)
ws.add_data_validation(dv_dept)

# Instructions sheet.
how = wb.create_sheet('How to fill this in', 1)
how.sheet_properties.tabColor = LICHEN
how.sheet_view.showGridLines = False
how.column_dimensions['A'].width = 3
how.column_dimensions['B'].width = 24
how.column_dimensions['C'].width = 16
how.column_dimensions['D'].width = 70
for r in range(1, 40):
    for c in range(1, 6):
        how.cell(row=r, column=c).fill = PatternFill('solid', fgColor=PAPER)
for c in range(1, 6):
    for r in (1, 2, 3):
        how.cell(row=r, column=c).fill = PatternFill('solid', fgColor=FOREST)
how['B2'] = 'YONDR CHRISTMAS CARDS'
how['B2'].font = Font(name=FONT, bold=True, size=10, color=LICHEN)
how['B3'] = 'How to fill in the address spreadsheet'
how['B3'].font = Font(name='Georgia', size=20, color=OFFWHITE)
how.row_dimensions[3].height = 34
steps = [
    '1.  Go to the Clients tab and add one row per person. Don’t change the column names in row 1.',
    '2.  Fill in every dark green column. Light green columns are optional.',
    '3.  Pick the Country (and your Department) from the dropdowns. Use the full mailing address, including suite or floor.',
    '4.  Save the file, then go to cards.overyondrdev.com and choose Upload a list.',
    '    We check every address and show any fixes before anything is added.',
]
for k, t in enumerate(steps):
    cell = how.cell(row=5 + k, column=2, value=t)
    cell.font = Font(name=FONT, size=11, color='1E1E1E')
r0 = 11
for c, t in zip('BCD', ['Column', '', 'What to enter']):
    cell = how[f'{c}{r0}']
    cell.value = t
    cell.font = Font(name=FONT, bold=True, size=10, color=MOSS)
    cell.fill = PatternFill('solid', fgColor=MIST)
for k, (head, req, _w, note) in enumerate(COLUMNS):
    r = r0 + 1 + k
    how[f'B{r}'] = head
    how[f'B{r}'].font = Font(name=FONT, bold=True, size=11, color=FOREST)
    how[f'B{r}'].alignment = Alignment(vertical='center')
    how[f'C{r}'] = 'Required' if req else 'Optional'
    how[f'C{r}'].font = Font(name=FONT, bold=True, size=9, color=LICHEN if req else MOSS)
    how[f'C{r}'].fill = PatternFill('solid', fgColor=FOREST if req else MIST)
    how[f'C{r}'].alignment = Alignment(horizontal='center', vertical='center')
    how[f'D{r}'] = note
    how[f'D{r}'].font = Font(name=FONT, size=11)
    how[f'D{r}'].alignment = Alignment(wrap_text=True, vertical='center')
    for c in 'BCD':
        how[f'{c}{r}'].border = Border(bottom=thin)
    how.row_dimensions[r].height = 30
ex = r0 + len(COLUMNS) + 2
how[f'B{ex}'] = 'Example row'
how[f'B{ex}'].font = Font(name=FONT, bold=True, size=11, color=FOREST)
example = ['Jane Smith', 'Acme Data Co', 'Head of Infrastructure', 'Commercial', '1600 Amphitheatre Pkwy', 'Suite 200',
           'Mountain View', 'CA', '94043', 'United States', 'jane@example.com', 'Met at the London summit']
how[f'B{ex + 1}'] = ' · '.join(f'{h}: {v}' for (h, *_r), v in zip(COLUMNS, example))
how[f'B{ex + 1}'].font = Font(name=FONT, size=10, italic=True, color=MOSS)

for sheet in (ws, how):
    sheet.page_setup.orientation = 'landscape'
    sheet.page_setup.fitToWidth = 1
    sheet.page_setup.fitToHeight = 0
    sheet.sheet_properties.pageSetUpPr.fitToPage = True
ws.print_title_rows = '1:1'

wb.active = 0
out = 'public/yondr-christmas-card-list.xlsx'
wb.save(out)
print('wrote', out, len(countries), 'countries')
