sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/core/Fragment"
], function (Controller, JSONModel, MessageToast, Fragment) {
  "use strict";

  return Controller.extend("sap.ui.timebookings.controller.Main", {

    onInit: function () {
      const oInitial = {
        entry: { start: null, end: null, shortText: "", accountingId: "", accountingText: "", projectId: "", project: "" },
        timer: 0,
        start: false,
        editMode: false,
        editContextPath: null
      };
      const oVM = new JSONModel(oInitial);
      oVM.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
      this.getView().setModel(oVM); // view-state model
    },

    _getODataModel: function () {
      return this.getView().getModel("odataModel") || this.getView().getModel();
    },

    _getEntriesBinding: function () {
      const oList = this.byId("entryList"); // ← use the real ID from XML
      return oList.getBinding("items");
    },


    onOpenTimePopup: async function () {
      const oVM = this.getView().getModel();

      // Read current project from main Select
      let sProjectId = "";
      let sProjectName = "";
      const oSelect = this.byId("projectSelectMain");
      if (oSelect) {
        sProjectId = oSelect.getSelectedKey();
        sProjectName = oSelect.getSelectedItem()?.getText() || "";
      }

      // Pre-fill dialog buffer
      oVM.setProperty("/entry", {
        start: new Date(),
        end: new Date(Date.now() + 30 * 60 * 1000),
        shortText: "",
        accountingId: "",
        accountingText: "",
        projectId: sProjectId,
        project: sProjectName
      });

      if (!this._oTimeDialog) {
        this._oTimeDialog = await Fragment.load({
          id: "timeInfoFragment",
          name: "sap.ui.timebookings.view.fragment.TimeInfoDialog",
          controller: this
        });
        this._oTimeDialog.setModel(oVM);
        this.getView().addDependent(this._oTimeDialog);
      }
      oVM.refresh(true);
      this._oTimeDialog.open();

      const oAddBtn = sap.ui.core.Fragment.byId("timeInfoFragment", "addBtn");
      if (oAddBtn) oAddBtn.setEnabled(false);

      // run validation once (no event)
      this.onDialogInputChange();
    },

    onPopupAdd: async function () {
      const oVM = this.getView().getModel();
      const oData = oVM.getProperty("/entry");

      const diffMs = oData.end - oData.start;
      const minutes = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(minutes / 60);
      const durationFormatted = (hours > 0 ? hours + "h " : "") + (minutes % 60) + "m";

      const payload = {
        start: oData.start.toISOString(),
        end: oData.end.toISOString(),
        shortText: oData.shortText,
        accountingText: oData.accountingText,
        accountingId: oData.accountingId,
        project: oData.project,
        projectId: oData.projectId,
        duration: durationFormatted,
        date: oData.start.toISOString().split("T")[0]
      };

      try {
        if (oVM.getProperty("/editMode") && this._editCtx) {
          // PATCH existing
          Object.keys(payload).forEach(k => this._editCtx.setProperty(k, payload[k]));
          await this._getODataModel().submitBatch("$auto");
          MessageToast.show("Eintrag aktualisiert");
          this._editCtx = null;
          oVM.setProperty("/editMode", false);
        } else {
          // CREATE new — insert at top so it’s visible immediately
          const oListBinding = this._getEntriesBinding();
          const oNewCtx = oListBinding.create(payload, /* bAtEnd */ false);
          await oNewCtx.created();
          MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgTimeSaved"));
        }

        // Re-evaluate grouping/sorting so the item appears right away
        const oList = this.byId("entryList");
        if (oList) {
          oList.getBinding("items").refresh();
          // If you need strict order, re-apply sorter:
          // oList.getBinding("items").sort(new sap.ui.model.Sorter("date", false));
        }
      } catch (e) {
        MessageToast.show("Fehler beim Speichern: " + (e.message || e));
      }

      this._oTimeDialog.close();
      oVM.setProperty("/entry", { start: null, end: null, shortText: "", accountingId: "", accountingText: "", projectId: "", project: "" });
    },


    onStartTimer: function () {
      const oVM = this.getView().getModel();
      const oSelect = this.byId("projectSelectMain");
      const sProjectId = oSelect?.getSelectedKey() || "";
  if (!sProjectId) {
    const oI18n = this.getOwnerComponent().getModel("i18n");
    oI18n.getResourceBundle().then((oBundle) => {
      MessageToast.show(oBundle.getText("msgChooseProject"));
    });
    return;
  }
      // also mirror into /entry so Stop dialog sees it
      oVM.setProperty("/entry/projectId", sProjectId);
      oVM.setProperty("/entry/project", oSelect?.getSelectedItem()?.getText() || "");

      if (!oVM.getProperty("/start")) {
        this._startTime = new Date();
        this._timerInterval = setInterval(() => {
          oVM.setProperty("/timer", oVM.getProperty("/timer") + 1);
        }, 1000);
        oVM.setProperty("/start", true);
      } else {
        clearInterval(this._timerInterval);
        this._stopTime = new Date();
        oVM.setProperty("/start", false);
        this._openStopDialog();
      }
    },

    _openStopDialog: function () {
      if (!this._pStopDialog) {
        Fragment.load({
          id: this.getView().getId(),
          name: "sap.ui.timebookings.view.fragment.StopDialog",
          controller: this
        }).then((oDialog) => {
          this._pStopDialog = oDialog;
          this.getView().addDependent(oDialog);
          oDialog.open();
          // No _validateStopDialog(); validation handled in onDialogInputChange
          const okBtn = sap.ui.core.Fragment.byId(this.getView().getId(), "okBtn");
          if (okBtn) okBtn.setEnabled(false);
        });
      } else {
        this._pStopDialog.open();
        const okBtn = sap.ui.core.Fragment.byId(this.getView().getId(), "okBtn");
        if (okBtn) okBtn.setEnabled(false);
      }
    },

    onStopConfirm: async function () {
      const oVM = this.getView().getModel();
      const oData = oVM.getProperty("/entry");

      // Read the latest project selection from the main select
      const oSelect = this.byId("projectSelectMain");
      const sProjectId = oSelect?.getSelectedKey() || oData.projectId || "";
      const sProjectName = oSelect?.getSelectedItem()?.getText() || oData.project || sProjectId;

      const { start, end, durationFormatted } = this.calculateDuration(this._startTime, this._stopTime);

      const payload = {
        start: start.toISOString(),
        end: end.toISOString(),
        shortText: oData.shortText,
        accountingText: oData.accountingText,
        accountingId: oData.accountingId,
        project: sProjectName,
        projectId: sProjectId,
        duration: durationFormatted,
        date: start.toISOString().split("T")[0]
      };

      try {
        const oListBinding = this._getEntriesBinding();
        const oNewCtx = oListBinding.create(payload, /* bAtEnd */ false); // put at top
        await oNewCtx.created();

        const oList = this.byId("entryList");
        if (oList) {
          oList.getBinding("items").refresh();
          // oList.getBinding("items").sort(new sap.ui.model.Sorter("date", false));
        }

        MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("msgTimeSaved"));

      } catch (e) {
        MessageToast.show("Fehler beim Speichern: " + (e.message || e));
      }

      // Reset UI state
      oVM.setProperty("/entry", { start: null, end: null, shortText: "", accountingId: "", accountingText: "", projectId: "", project: "" });
      oVM.setProperty("/timer", 0);
      oVM.setProperty("/start", false);
      oVM.refresh(true);
      this._pStopDialog.close();
    },


    onEditEntry: async function (oEvent) {
      const oVM = this.getView().getModel();
      const oCtx = oEvent.getSource().getBindingContext("odataModel");
      if (!oCtx) return;

      const oEntry = oCtx.getObject();
      oVM.setProperty("/entry", {
        start: new Date(oEntry.start),
        end: new Date(oEntry.end),
        shortText: oEntry.shortText,
        accountingText: oEntry.accountingText,  // ← fixed
        accountingId: oEntry.accountingId,
        project: oEntry.project,
        projectId: oEntry.projectId
      });

      oVM.setProperty("/editMode", true);
      this._editCtx = oCtx;                      // ← store context object
      oVM.setProperty("/editContextPath", null); // optional: clear old path

      if (!this._oTimeDialog) {
        this._oTimeDialog = await Fragment.load({
          id: "timeInfoFragment",
          name: "sap.ui.timebookings.view.fragment.TimeInfoDialog",
          controller: this
        });
        this.getView().addDependent(this._oTimeDialog);
      }
      this._oTimeDialog.open();
    },

    onDeleteEntry: async function (oEvent) {
      const oCtx = oEvent.getSource().getBindingContext("odataModel");
      if (!oCtx) return;
      try {
        await oCtx.delete("$auto");
        MessageToast.show("Eintrag gelöscht");
      } catch (e) {
        MessageToast.show("Löschen fehlgeschlagen: " + (e.message || e));
      }
    },

    onDialogInputChange: function (oEvent) {
      const oVM = this.getView().getModel();
      const oEntry = oVM.getProperty("/entry");

      // Only write-to-model if event exists (safe to call without event)
      if (oEvent && oEvent.getSource) {
        const oSource = oEvent.getSource();
        const sId = oSource.getId ? oSource.getId() : "";

        if (sId.includes("shortTextInput")) {
          oVM.setProperty("/entry/shortText", oSource.getValue());
        }
        if (sId.includes("accountingSelect")) {
          oVM.setProperty("/entry/accountingId", oSource.getSelectedKey());
          oVM.setProperty("/entry/accountingText", oSource.getSelectedItem()?.getText());
        }
        if (sId.includes("projectSelect")) {
          oVM.setProperty("/entry/projectId", oSource.getSelectedKey());
          oVM.setProperty("/entry/project", oSource.getSelectedItem()?.getText());
        }
      }

      const isShortTextValid = typeof oEntry.shortText === "string" && oEntry.shortText.trim().length >= 5;
      const isAccountingValid = typeof oEntry.accountingId === "string" && oEntry.accountingId.trim().length > 0;
      const isProjectValid = typeof oEntry.projectId === "string" && oEntry.projectId.trim().length > 0;

      const oOkBtn = sap.ui.core.Fragment.byId(this.getView().getId(), "okBtn");
      const oAddBtn = sap.ui.core.Fragment.byId("timeInfoFragment", "addBtn");

      if (oOkBtn) oOkBtn.setEnabled(isShortTextValid && isAccountingValid);

      if (oAddBtn) {
        const isStartValid = oEntry.start instanceof Date && !isNaN(oEntry.start);
        const isEndValid = oEntry.end instanceof Date && !isNaN(oEntry.end);
        oAddBtn.setEnabled(isShortTextValid && isAccountingValid && isProjectValid && isStartValid && isEndValid);
      }
    },

    onPopupCancel: function () { this._oTimeDialog.close(); },
    onStopCancel: function () { this._pStopDialog.close(); },

    // Util
    formatHours: t => t !== undefined ? String(Math.floor(t / 3600)).padStart(2, "0") : "00",
    formatMinutes: t => t !== undefined ? String(Math.floor((t % 3600) / 60)).padStart(2, "0") : "00",
    formatSeconds: t => t !== undefined ? String(t % 60).padStart(2, "0") : "00",
    formatButtonType: bStarted => bStarted ? "Negative" : "Default",

    calculateDuration: function (startDate, endDate) {
      const diffMs = endDate - startDate;
      const durationInMinutes = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(durationInMinutes / 60);
      const minutes = durationInMinutes % 60;
      const durationFormatted = (hours > 0 ? hours + "h " : "") + minutes + "m";
      return { start: startDate, end: endDate, durationFormatted };
    },

    getGroupHeader: function (oGroup) {
      return new sap.m.GroupHeaderListItem({ title: "Datum: " + oGroup.key, upperCase: false });
    }

  });
});
