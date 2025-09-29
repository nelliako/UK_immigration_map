from extensions import db
import csv
from main import create_app
import os

# This class defines the structure of the 'immigration' table in the database
# It inherits from db.Model, which gives it SQLAlchemy ORM (Object-Relational Mapper) capabilities
class ImmigrationStats(db.Model):
    __tablename__ = 'immigration'
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    Year = db.Column(db.Integer, nullable=True) 
    Quarter = db.Column(db.String(200))
    Nationality = db.Column(db.String(200))
    Region = db.Column(db.String(200))
    Visa_type_group = db.Column(db.String(200))
    Visa_type = db.Column(db.String(200))
    Visa_type_subgroup = db.Column(db.String(200))
    Applicant_type = db.Column(db.String(50))
    Case_outcome = db.Column(db.String(20))
    Decisions = db.Column(db.Integer, nullable=True) 

    def __repr__(self):
        return f"<ImmigrationStats Nationality='{self.Nationality}' Year='{self.Year}'>"

# This function reads data from a CSV and populates the database
def populate_db_from_csv(file_path, reset_db=False):
    """Populates the database from a CSV file."""
    app = create_app()
    with app.app_context():
        if reset_db:
            print("Resetting database: dropping all tables...")
            db.drop_all()
            db.create_all()
            print("Database has been reset.")

        print(f"Opening file: {file_path}")
        # Safely openning the CSV file with UTF-8 encoding to handle a wide range of characters
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            entries_to_add = []
            for row in reader:
                # Cleaning headers (e.g., "Visa type" -> "Visa_type")
                cleaned_row = {k.strip().replace(' ', '_'): v for k, v in row.items()}
                
                # Cleaning and converting numeric fields with error handling.
                try:
                    # Handling year
                    if 'Year' in cleaned_row and cleaned_row['Year']:
                        cleaned_row['Year'] = int(cleaned_row['Year'])
                    else:
                        cleaned_row['Year'] = None # Default to None if empty

                    # Converting 'Decisions' to an integer, first removing any commas from the string
                    if 'Decisions' in cleaned_row and cleaned_row['Decisions']:
                        cleaned_row['Decisions'] = int(cleaned_row['Decisions'].replace(",", ""))
                    else:
                        cleaned_row['Decisions'] = None # Default to None if empty

                except (ValueError, TypeError):
                    # If a conversion error occurs, printing a warning and skipping this row
                    print(f"Skipping row due to data conversion error: {row}")
                    continue 

                # Creating a new ImmigrationStats object using the cleaned row data
                # The '**cleaned_row' syntax unpacks the dictionary to match object attributes
                new_entry = ImmigrationStats(**cleaned_row)
                # Adding the newly created object to the list
                entries_to_add.append(new_entry)
        
        if entries_to_add:
            print(f"Adding {len(entries_to_add)} new entries to the database...")
            db.session.bulk_save_objects(entries_to_add) 
            db.session.commit()
            print("Database populated successfully.")
        else:
            print("No new entries were added.")

if __name__ == '__main__':
    csv_file = "data/immigration.csv"
   
    populate_db_from_csv(csv_file, reset_db=True)