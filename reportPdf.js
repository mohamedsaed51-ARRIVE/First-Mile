/**
 * reportPdf.js — ARRIVE First Mile Dashboard (Phase 4: Report Export / Print)
 * ------------------------------------------------------------------
 * This module owns ONLY the export/print pipeline for the Management
 * Report. It does not filter, aggregate, compare, or build any report
 * data itself — it consumes the exact object reportPreview.js already
 * rendered (via getLastData()), which is itself the exact object
 * buildManagementReportData() produced. If no report has been
 * generated yet, there is nothing to export.
 *
 * Architecture (unchanged data flow, this module only sits at the end):
 *   state -> filter engine -> aggregate -> comparison ->
 *   buildManagementReportData -> report preview -> reportPdf (this file)
 *
 * The export itself uses the browser's native print pipeline
 * (window.print() + @page/@media print CSS in index.html) so the
 * output is real, selectable HTML/SVG text — not a screenshot/canvas
 * rendering. Comparison content only ever appears in the printed
 * output because renderComparisonSection() already omitted it when
 * data.comparison is null — this module never decides that itself.
 * ------------------------------------------------------------------
 */
window.DashboardReportPdf = (function(){

  /**
   * createReportPdf(deps) — deps:
   *   exportBtnId: id of the "Export PDF" button (see index.html)
   *   footerGeneratedId: id of the print-only footer's timestamp span
   *   generatedLabelId: id of the on-screen "Generated on ..." label —
   *     its text is copied into the print footer as-is (no recompute)
   *   getLastData: reportPreview.getLastData — returns null if the
   *     report has never been rendered yet
   */
  function createReportPdf(deps){
    const { exportBtnId, footerGeneratedId, generatedLabelId, getLastData } = deps;
    const exportBtn = document.getElementById(exportBtnId);
    const footerGeneratedEl = document.getElementById(footerGeneratedId);
    const generatedLabelEl = document.getElementById(generatedLabelId);

    function syncFooter(){
      // Pure DOM copy of already-rendered text — no data access, no
      // recomputation. Keeps the print-only footer in sync with
      // whatever reportPreview.js's own generated-on label says.
      if(footerGeneratedEl && generatedLabelEl){
        footerGeneratedEl.textContent = generatedLabelEl.textContent;
      }
    }

    function exportPdf(){
      const data = getLastData ? getLastData() : null;
      if(!data) return; // nothing rendered yet — Management Report was never opened
      syncFooter();
      window.print();
    }

    // beforeprint/afterprint are window-level listeners, so they are not
    // cleaned up by dashboard.js's node-cloning refresh pattern (that
    // only covers element-level listeners like the click handler below).
    // createReportPdf() re-runs on every dashboard refresh, so guard
    // these the same way reportPreview.js guards its keydown handler.
    function beforePrint(){ syncFooter(); document.body.classList.add('report-printing'); }
    function afterPrint(){ document.body.classList.remove('report-printing'); }

    if(window.__reportPdfBeforePrintHandler){
      window.removeEventListener('beforeprint', window.__reportPdfBeforePrintHandler);
    }
    if(window.__reportPdfAfterPrintHandler){
      window.removeEventListener('afterprint', window.__reportPdfAfterPrintHandler);
    }
    window.__reportPdfBeforePrintHandler = beforePrint;
    window.__reportPdfAfterPrintHandler = afterPrint;
    window.addEventListener('beforeprint', window.__reportPdfBeforePrintHandler);
    window.addEventListener('afterprint', window.__reportPdfAfterPrintHandler);

    // The export button itself IS in dashboard.js's resetInteractiveNodes()
    // clone-and-replace list, so on every background refresh it arrives
    // here as a fresh node with no listeners attached yet — a plain
    // addEventListener on each createReportPdf() call is correct and
    // does not accumulate duplicates.
    if(exportBtn){
      exportBtn.addEventListener('click', exportPdf);
    }

    return { exportPdf };
  }

  return { createReportPdf };
})();
