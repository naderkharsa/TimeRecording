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
          date: "",
          hours: "",
          shortText: "",
          projectId: "",
          project: "",
          accounting: ""
        },
        popupStop: {
          shortText: "",
          accounting: ""
        },
        popupData: {
          start: null,
          end: null,
          shortText: "",
          accounting: "",
          project: "",
          projectId: ""
        },
        entries: [],
        timer: 0,
        start: false
      };

      const oModel = new JSONModel(oInitialData);
      oModel.setDefaultBindingMode(sap.ui.model.BindingMode.TwoWay);
      this.getView().setModel(oModel);

      const sProjectsPath = sap.ui.require.toUrl("sap/ui/timebookings/model/projects.json");
      const oProjectModel = new JSONModel();
      oProjectModel.loadData(sProjectsPath, null, false);
      this.getView().setModel(oProjectModel, "projectsModel");

      const sEntriesPath = sap.ui.require.toUrl("sap/ui/timebookings/model/entries.json");
      const oJSONLoader = new JSONModel();
      oJSONLoader.loadData(sEntriesPath, null, true);
      oJSONLoader.attachRequestCompleted(() => {
        const loadedEntries = oJSONLoader.getData();
        if (loadedEntries && Array.isArray(loadedEntries.entries)) {
          oModel.setProperty("/entries", loadedEntries.entries);
        }
      });

      this._intervalId = null;
    },



    // Öffnet das Zeitdialog-Fragment
    onOpenTimePopup: async function () {
      const oModel = this.getView().getModel();
      
    
      oModel.setProperty("/popupData", {
        start: null,
        end: null,
        shortText: "",
        accounting: "",
        project: "",
        projectId: ""
      });
    
      // open Fragment 
      if (!this._oTimeDialog) {
        try {
          const oDialog = await Fragment.load({
            id: "timeInfoFragment",
            name: "sap.ui.timebookings.view.fragment.TimeInfoDialog",
            controller: this
          });
    
          this._oTimeDialog = oDialog;
          oDialog.setModel(oModel);
          this.getView().addDependent(oDialog);
          oDialog.open();
          this.onPopupInputChange();
    
        } catch (err) {
          console.error("Failed to load fragment:", err);
        }
      } else {
        this._oTimeDialog.open();
        this.onPopupInputChange();
      }
    },
    
    onPopupAdd: function () {
      const oModel = this.getView().getModel();
      const oData = oModel.getProperty("/popupData");
    
      const oStartDate = Fragment.byId("timeInfoFragment", "startPicker").getDateValue();
      const oEndDate = Fragment.byId("timeInfoFragment", "endPicker").getDateValue();
    
      if (!oStartDate || !oEndDate || !oData.shortText || !oData.projectId || !oData.accounting) {
        MessageToast.show("Bitte alle Felder ausfüllen.");
        return;
      }
    
      const { start, end, durationFormatted } = this.calculateDuration(oStartDate, oEndDate);
    
      const oSelect = Fragment.byId("timeInfoFragment", "projectSelectPopup");
      const sProjectName = oSelect?.getSelectedItem()?.getText() || oData.projectId;
    
      const aEntries = oModel.getProperty("/entries") || [];
      aEntries.unshift({
        project: sProjectName,
        projectId: oData.projectId,
        start,
        end,
        accounting: oData.accounting,
        shortText: oData.shortText,
        duration: durationFormatted
      });
    
      oModel.setProperty("/entries", aEntries);
      this._oTimeDialog.close();
    },    
    
    onStartTimer: function () {
      const oModel = this.getView().getModel();
      if (!oModel.getProperty("/start")) {
        this._startTime = new Date();
        this._timerInterval = setInterval(() => {
          const current = oModel.getProperty("/timer");
          oModel.setProperty("/timer", current + 1);
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
        });
      } else {
        this._pStopDialog.open();
      }
    },
    onStopConfirm: function () {
      const oModel = this.getView().getModel();
      const popupData = oModel.getProperty("/popupStop");
    
      if (!popupData.shortText || popupData.shortText.trim().length === 0) {
        MessageToast.show("beschreibe deine Arbeit.");
        return;
      }
    
      const { start, end, durationFormatted } = this.calculateDuration(this._startTime, this._stopTime);
    
      const oSelect = this.byId("projectSelectMain");
      const sProjectId = oSelect?.getSelectedKey();
      const sProjectName = oSelect?.getSelectedItem()?.getText() || sProjectId;
    
      const aEntries = oModel.getProperty("/entries") || [];
      aEntries.unshift({
        project: sProjectName,
        projectId: sProjectId,
        start,
        end,
        accounting: popupData.accounting,
        shortText: popupData.shortText,
        duration: durationFormatted
      });
    
      oModel.setProperty("/entries", aEntries);
      this._pStopDialog.close();
    
      oModel.setProperty("/popupStop", { shortText: "", accounting: "" });
      oModel.setProperty("/timer", 0);
      oModel.setProperty("/start", false);
    },    


    // Projekt und Accounting Auswahlhandler
    onProjectChange: function (oEvent) {
      const oModel = this.getView().getModel();
      const sKey = oEvent.getSource().getSelectedKey();
      const sText = oEvent.getSource().getSelectedItem().getText();
      oModel.setProperty("/entry/projectId", sKey);
      oModel.setProperty("/entry/project", sText.split(" (")[0]);
    },
    onAccountingChange: function (oEvent) {
      const oModel = this.getView().getModel();
      const sText = oEvent.getSource().getSelectedItem().getText();
      oModel.setProperty("/entry/accounting", sText);
    },

    getGroupHeader: function (oGroup) {
      return new sap.m.GroupHeaderListItem({
        title: "Datum: " + oGroup.key,
        upperCase: false
      });
    },

    // Suche (optional)
    onSearch: function (oEvent) {
      const sQuery = oEvent.getParameter("query");
      const oList = this.byId("entryList");
      const oBinding = oList.getBinding("items");
      const aFilters = [];

      if (sQuery) {
        aFilters.push(new sap.ui.model.Filter("project", sap.ui.model.FilterOperator.Contains, sQuery));
      }

      oBinding.filter(aFilters);
    },

    onDeleteEntry: function (oEvent) {
      const oModel = this.getView().getModel();
      const oContext = oEvent.getSource().getBindingContext();
      const sPath = oContext.getPath(); // e.g., "/entries/2"
    
      const iIndex = parseInt(sPath.split("/").pop(), 10);
      const aEntries = [...oModel.getProperty("/entries")]; // shallow copy (good practice)
      aEntries.splice(iIndex, 1);
    
      oModel.setProperty("/entries", aEntries);
    },
        
    // Dialogaktionen abbrechen
    onPopupCancel: function () {
      this._oTimeDialog.close();
    },
    onStopCancel: function () {
      this._pStopDialog.close();
    },

    onDescriptionChange: function (oEvent) {
      const text = oEvent.getSource().getValue();
      const okBtn = Fragment.byId(this.getView().getId(), "okBtn");
      if (okBtn) {
        okBtn.setEnabled(text.trim().length > 0);
      }
    },
    
    
    onPopupInputChange: function (oEvent) {
      const oModel = this.getView().getModel();
      const data = oModel.getProperty("/popupData");
    
      const sShortText = (oEvent?.getSource()?.getId?.().includes("shortTextInput2"))
        ? oEvent.getSource().getValue()
        : data.shortText;
    
      const isStartValid = data.start instanceof Date && !isNaN(data.start);
      const isEndValid = data.end instanceof Date && !isNaN(data.end);
      const hasShortText = typeof sShortText === "string" && sShortText.trim().length > 0;
      const hasProjectId = typeof data.projectId === "string" && data.projectId.trim().length > 0;
      const hasAccounting = typeof data.accounting === "string" && data.accounting.trim().length > 0;
    
      const isValid = isStartValid && isEndValid && hasShortText && hasProjectId && hasAccounting;
    
      const addBtn = sap.ui.core.Fragment.byId("timeInfoFragment", "addBtn");
      if (addBtn) {
        addBtn.setEnabled(isValid);
      }
    },    
        // UI Hilfsfunktionen
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
        
          return {
            start: startDate,
            end: endDate,
            durationFormatted: durationFormatted
          }
        },

    onSave: function () {
      // const oModel = this.getView().getModel();
      // const aEntries = oModel.getProperty("/entries");
      // Logik für Speichern auf Server hier einbauen
    },

    onCancel: function () {
      // const oModel = this.getView().getModel();
      // oModel.setProperty("/entries", []);
    }
  });
});
