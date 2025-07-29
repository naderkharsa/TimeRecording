sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/m/MessageToast",
  "sap/ui/core/Fragment"
], function (Controller, JSONModel, MessageToast, Fragment) {
  "use strict";

  return Controller.extend("sap.ui.timebookings.controller.Main", {
    onInit: function () {
      const oInitialData = {
        entry: {
          start: null,
          end: null,
          shortText: "",
          accountingId: "",
          accountingText: "",
          projectId: "",
          project: ""
        },
        entries: [],
        timer: 0,
        start: false
      };
      const oModel = new JSONModel(oInitialData);
      oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
      this.getView().setModel(oModel);

      // Load Projects
      const sProjectsPath = sap.ui.require.toUrl("sap/ui/timebookings/model/projects.json");
      const oProjectModel = new JSONModel();
      oProjectModel.loadData(sProjectsPath, null, false);
      this.getView().setModel(oProjectModel, "projectsModel");

      // Load Entries
      const sEntriesPath = sap.ui.require.toUrl("sap/ui/timebookings/model/entries.json");
      const oJSONLoader = new JSONModel();
      oJSONLoader.loadData(sEntriesPath, null, true);
      oJSONLoader.attachRequestCompleted(() => {
        const loadedEntries = oJSONLoader.getData();
        if (loadedEntries && Array.isArray(loadedEntries.entries)) {
          oModel.setProperty("/entries", loadedEntries.entries);
        }
      });
    },

    // ---- Always copy main view selection before opening the popup ----
    onOpenTimePopup: async function () {
      const oModel = this.getView().getModel();

      // Get current project/accounting selection from main view
      let sProjectId = "";
      let sProjectName = "";
      const oSelect = this.byId("projectSelectMain");
      if (oSelect) {
        sProjectId = oSelect.getSelectedKey();
        sProjectName = oSelect.getSelectedItem()?.getText() || "";
      }

      // Pre-fill /entry with main view selection
      oModel.setProperty("/entry", {
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
        this._oTimeDialog.setModel(oModel);
        this.getView().addDependent(this._oTimeDialog);
      }
      oModel.refresh(true); // Always refresh before open
      this._oTimeDialog.open();
      this.onPopupInputChange();
    },

    // ---- Adding or editing an entry (fragment "+" button) ----
    onPopupAdd: function () {
      const oModel = this.getView().getModel();
      const oData = oModel.getProperty("/entry");
      const aEntries = oModel.getProperty("/entries");


      const diffMs = oData.end - oData.start;
      const hours = Math.floor(Math.round(diffMs / (1000 * 60)) / 60);
      const minutes = Math.round(diffMs / (1000 * 60)) % 60;
      const durationFormatted = (hours > 0 ? hours + "h " : "") + minutes + "m";

      const oNewEntry = {
        start: oData.start.toISOString(),
        end: oData.end.toISOString(),
        shortText: oData.shortText,
        accounting: oData.accountingText,
        accountingId: oData.accountingId,
        project: oData.project,
        projectId: oData.projectId,
        duration: durationFormatted,
        date: oData.start.toISOString().split("T")[0]
      };

      // Handle edit mode (if editing existing entry)
      const bEditMode = oModel.getProperty("/editMode");
      const iEditIndex = oModel.getProperty("/editIndex");
      if (bEditMode) {
        aEntries[iEditIndex] = oNewEntry; //writes the edited entry in 
        oModel.setProperty("/editMode", false);
        oModel.setProperty("/editIndex", null);
      } else {
        aEntries.push(oNewEntry);  //writes the entry in 
      }
      //aEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
      oModel.setProperty("/entries", aEntries);

      this._oTimeDialog.close();
      oModel.setProperty("/entry", {
        start: null, end: null, shortText: "",
        accountingId: "", accountingText: "",
        projectId: "", project: ""
      });
    },

    // ---- Start/Stop Timer logic ----
    onStartTimer: function () {
      const oModel = this.getView().getModel();
      const sProjectId = oModel.getProperty("/entry/projectId");
      if (!sProjectId) {
        MessageToast.show("Wähle ein Projekt aus!");
        return;
      }
      if (!oModel.getProperty("/start")) {
        this._startTime = new Date();
        this._timerInterval = setInterval(() => {
          oModel.setProperty("/timer", oModel.getProperty("/timer") + 1);
        }, 1000);
        oModel.setProperty("/start", true);
      } else {
        clearInterval(this._timerInterval);
        this._stopTime = new Date();
        oModel.setProperty("/start", false);
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
          this._validateStopDialog();
        });
      } else {
        this._pStopDialog.open();
        this._validateStopDialog(); 
      }
    },

    // ---- Stop Dialog OK: Always fetch project/accounting selection before saving ----
    onStopConfirm: function () {
      const oModel = this.getView().getModel();
      const oData = oModel.getProperty("/entry");

      // For Start/Stop, always get current main project/accounting selection
      let sProjectId = oData.projectId;
      let sProjectName = oData.project;
      const oSelect = this.byId("projectSelectMain");
      if (oSelect) {
        sProjectId = oSelect.getSelectedKey();
        // Use the real project name from projectsModel, not just dropdown
        const oProjectsModel = this.getView().getModel("projectsModel");
        const aProjects = oProjectsModel.getProperty("/projects") || [];
        const oProj = aProjects.find(p => p.projectID === sProjectId);
        sProjectName = oProj ? oProj.project : sProjectId;
      }

      // Calculate duration
      const { start, end, durationFormatted } = this.calculateDuration(this._startTime, this._stopTime);

      const oNewEntry = {
        start: start.toISOString(),
        end: end.toISOString(),
        shortText: oData.shortText,
        accounting: oData.accountingText,
        accountingId: oData.accountingId,
        project: sProjectName,
        projectId: sProjectId,
        duration: durationFormatted,
        date: start.toISOString().split("T")[0]
      };

      const aEntries = oModel.getProperty("/entries") || [];
      aEntries.unshift(oNewEntry);
      //aEntries.sort((a, b) => new Date(b.date) - new Date(a.date));
      oModel.setProperty("/entries", aEntries);

      // Reset for next use
      oModel.setProperty("/entry", {
        start: null, end: null, shortText: "",
        accountingId: "", accountingText: "",
        projectId: "", project: ""
      });
      oModel.setProperty("/timer", 0);
      oModel.setProperty("/start", false);
      oModel.refresh(true);
      this._pStopDialog.close();
    },

    onEditEntry: async function (oEvent) {
      const oModel = this.getView().getModel();
      const oItem = oEvent.getSource().getParent().getParent();
      const sPath = oItem.getBindingContext().getPath();
      const iIndex = parseInt(sPath.split("/").pop(), 10);
      const oEntry = oModel.getProperty(sPath);

      oModel.setProperty("/entry", {
        start: new Date(oEntry.start),
        end: new Date(oEntry.end),
        shortText: oEntry.shortText,
        accountingText: oEntry.accounting,
        accountingId: oEntry.accountingId,
        project: oEntry.project,
        projectId: oEntry.projectId
      });

      oModel.setProperty("/editMode", true);
      oModel.setProperty("/editIndex", iIndex);

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

    onDeleteEntry: function (oEvent) {
      const oModel = this.getView().getModel();
      const oContext = oEvent.getSource().getBindingContext();
      const sPath = oContext.getPath();
      const iIndex = parseInt(sPath.split("/").pop(), 10);
      const aEntries = [...oModel.getProperty("/entries")];
      aEntries.splice(iIndex, 1);
      oModel.setProperty("/entries", aEntries);
    },

    onPopupCancel: function () {
      this._oTimeDialog.close();
    },

    onStopCancel: function () {
      this._pStopDialog.close();
    },

    // ---- Select controls update model values immediately ----
    onPopupInputChange: function (oEvent) {
      const oModel = this.getView().getModel();
      const data = oModel.getProperty("/entry");
      const oSource = oEvent?.getSource?.();
      const sId = oSource?.getId?.() || "";

      if (sId.includes("shortTextInput")) {
        oModel.setProperty("/entry/shortText", oSource.getValue());
      }
      if (sId.includes("projectSelect")) {
        const sKey = oSource.getSelectedKey();
        const sText = oSource.getSelectedItem()?.getText();
        oModel.setProperty("/entry/projectId", sKey);
        oModel.setProperty("/entry/project", sText);
      }
      if (sId.includes("accountingSelect")) {
        const sKey = oSource.getSelectedKey();
        const sText = oSource.getSelectedItem()?.getText();
        oModel.setProperty("/entry/accountingId", sKey);
        oModel.setProperty("/entry/accountingText", sText);
      }

      // Validate
      const isStartValid = data.start instanceof Date && !isNaN(data.start);
      const isEndValid = data.end instanceof Date && !isNaN(data.end);
      const hasShortText = typeof data.shortText === "string" && data.shortText.trim().length > 0;
      const hasProjectId = typeof data.projectId === "string" && data.projectId.trim().length > 0;
      const hasAccounting = typeof data.accountingId === "string" && data.accountingId.trim().length > 0;
      const isValid = isStartValid && isEndValid && hasShortText && hasProjectId && hasAccounting;
      const addBtn = sap.ui.core.Fragment.byId("timeInfoFragment", "addBtn");
      if (addBtn) {
        addBtn.setEnabled(isValid);
      }
      this._validateStopDialog?.();
    },

    _validateStopDialog: function () {
      const oModel = this.getView().getModel();
      const oData = oModel.getProperty("/entry");
      const okBtn = sap.ui.core.Fragment.byId(this.getView().getId(), "okBtn");
      const hasShortText = oData.shortText && oData.shortText.trim().length > 0;
      const hasAccounting = oData.accountingId && oData.accountingId.trim().length > 0;
      if (okBtn) {
        okBtn.setEnabled(!!(hasShortText && hasAccounting));
      }
    },

    // Utility formatters
    formatHours: function (t) {
      return t !== undefined ? String(Math.floor(t / 3600)).padStart(2, "0") : "00";
    },
    formatMinutes: function (t) {
      return t !== undefined ? String(Math.floor((t % 3600) / 60)).padStart(2, "0") : "00";
    },
    formatSeconds: function (t) {
      return t !== undefined ? String(t % 60).padStart(2, "0") : "00";
    },
    formatButtonType: function (bStarted) {
      return bStarted ? "Negative" : "Default";
    },
    calculateDuration: function (startDate, endDate) {
      const diffMs = endDate - startDate;
      const durationInMinutes = Math.round(diffMs / (1000 * 60));
      const hours = Math.floor(durationInMinutes / 60);
      const minutes = durationInMinutes % 60;
      const durationFormatted = (hours > 0 ? hours + "h " : "") + minutes + "m";
      return { start: startDate, end: endDate, durationFormatted: durationFormatted };
    },

    getGroupHeader: function (oGroup) {
      return new sap.m.GroupHeaderListItem({
        title: "Datum: " + oGroup.key,
        upperCase: false
      });
    },
    
    /*
    onSearch: function (oEvent) {
    },

    onSave: function () { 
      Implement server logic here 
     },
    onCancel: function () { 
      Implement clear/reset logic here if needed 
     }

     */

  });
 
});
