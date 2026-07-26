import React, { useMemo } from 'react'
import { SIMPLE_RESULT_META } from './builderSkillsCore'
import './simple-training-grid.css'

function cellTitle(summary, row) {
  return [
    summary.builder.name,
    row.trainingName,
    `Result: ${row.result}`,
    `Detailed status: ${row.detailedStatus}`,
    row.completionDate ? `Completed: ${row.completionDate}` : '',
    row.expirationDate ? `Expires: ${row.expirationDate}` : '',
    row.trainerName ? `Trainer: ${row.trainerName}` : '',
    row.notes ? `Notes: ${row.notes}` : '',
  ].filter(Boolean).join('\n')
}

export default function SimpleTrainingGrid({
  visibleSummaries = [],
  snapshot,
  setSelectedBuilderId,
  setMode,
  openQualification,
  saving,
}) {
  const columns = useMemo(() => visibleSummaries[0]?.rows || [], [visibleSummaries])
  const rowMaps = useMemo(() => new Map(visibleSummaries.map((summary) => [
    summary.builder.id,
    new Map(summary.rows.map((row) => [row.trainingId, row])),
  ])), [visibleSummaries])

  if (!visibleSummaries.length) return <div className="card training-loading">No builders match the selected filters.</div>

  return <div className="simple-training-grid-card">
    <div className="simple-training-grid-heading skills-no-print">
      <div>
        <div className="table-kicker">Training Grid</div>
        <div className="small">Builders are rows. Training areas are columns. Missing records automatically show Not Trained.</div>
      </div>
      <div className="simple-training-grid-legend">
        {Object.entries(SIMPLE_RESULT_META).map(([result, meta]) => <span className={meta.className} key={result}>{result}</span>)}
      </div>
    </div>

    <div className="simple-training-grid-wrap">
      <table className="simple-training-grid">
        <thead>
          <tr>
            <th className="simple-training-builder-column">Builder</th>
            {columns.map((column) => <th key={column.trainingId} title={column.category}>{column.trainingName}</th>)}
          </tr>
        </thead>
        <tbody>
          {visibleSummaries.map((summary) => {
            const byTrainingId = rowMaps.get(summary.builder.id)
            return <tr key={summary.builder.id}>
              <th className="simple-training-builder-column">
                <button type="button" onClick={() => { setSelectedBuilderId(summary.builder.id); setMode('single') }}>{summary.builder.name}</button>
              </th>
              {columns.map((column) => {
                const row = byTrainingId.get(column.trainingId)
                const result = row?.result || 'Not Trained'
                const meta = SIMPLE_RESULT_META[result] || SIMPLE_RESULT_META['Not Trained']
                return <td key={column.trainingId} className={meta.className}>
                  <button
                    type="button"
                    disabled={saving || !snapshot.permissions.canEditQualifications}
                    title={row ? cellTitle(summary, row) : `${summary.builder.name}\n${column.trainingName}\nResult: Not Trained\nDetailed status: Not Started`}
                    onClick={() => openQualification(summary.builder.id, column.trainingId)}
                  >{result}</button>
                </td>
              })}
            </tr>
          })}
        </tbody>
      </table>
    </div>
  </div>
}
