using my.bookings as bookings from '../db/data-model';

service BookingService {
    entity Entries as projection on bookings.Entries;
    entity Projects as projection on bookings.Projects;
}
