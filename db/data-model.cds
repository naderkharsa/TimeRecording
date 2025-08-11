namespace my.bookings;

entity Entries {
  key ID          : UUID;
  projectId       : String;
  project         : String;
  shortText       : String;
  accountingId    : String;
  accountingText  : String;
  start           : DateTime;
  end             : DateTime;
  duration        : String;
  date            : Date;
}

entity Projects {
  key projectID : String;
  project       : String;
}
